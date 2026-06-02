import { db as edgeDb } from "edgespark";
import { eq } from "drizzle-orm";
import { brandRuleVersions, cards } from "@defs";
import { checkCost, writeCost, type CostQuoteItem } from "../cost";
import { isRecord, parseJson } from "../json";
import { getOpenAiApiKey, isDevEnv } from "../ownerConfig";
import { parsePaletteColors, resolveActivePalette } from "../palettes";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const SUGGEST_LAYOUT_QUOTE: CostQuoteItem = { provider: "openai", operation: "openai.layout.suggest.gpt-4o-mini", units: 1, unitMicros: 4_000 };

export interface SuggestedLayerGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface LayoutSuggestion {
  layers: SuggestedLayerGeometry[];
  rationale: string;
}

export class LayoutSuggestionError extends Error {
  status: 400 | 403 | 404 | 429 | 502;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: 400 | 403 | 404 | 429 | 502, code: string, message = code, extra?: Record<string, unknown>) {
    super(message);
    this.name = "LayoutSuggestionError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

interface LayoutContext {
  cardId: string;
  canvas: { width: number; height: number };
  layers: InputLayer[];
  brandRules: unknown[];
  paletteColors: Array<Record<string, unknown>>;
}

interface InputLayer {
  id: string;
  type: string;
  name?: string;
  text?: string;
  assetRole?: string;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation?: number | null;
}

export async function suggestLayoutForCard(
  input: { cardId: string; userId: string; isOwner?: boolean; agentRunId?: string | null },
  database: any = edgeDb,
): Promise<LayoutSuggestion> {
  const context = await resolveLayoutContext(input, database);
  const quote = await checkCost(database, input.userId, [SUGGEST_LAYOUT_QUOTE]);
  if (!quote.allowed) throw new LayoutSuggestionError(429, "budget_exhausted", "Daily layout suggestion budget would be exceeded.", { quote });

  const apiKey = getOpenAiApiKey();
  let rawSuggestion: unknown;
  if (!apiKey) {
    if (!isDevEnv()) throw new LayoutSuggestionError(502, "openai_api_key_missing", "OpenAI API key missing.");
    rawSuggestion = localSuggestion(context);
    await writeCost(database, quote, input.agentRunId ?? null);
  } else {
    rawSuggestion = await callLayoutModel(context, apiKey, database, quote, input.agentRunId ?? null);
  }
  return validateSuggestion(rawSuggestion, context);
}

async function resolveLayoutContext(
  input: { cardId: string; userId: string; isOwner?: boolean },
  database: any,
): Promise<LayoutContext> {
  const [card] = await database.select().from(cards).where(eq(cards.id, input.cardId)).limit(1);
  if (!card || card.deletedAt) throw new LayoutSuggestionError(404, "card_not_found", "Card not found.");
  if (card.creatorUserId !== input.userId && input.isOwner !== true) {
    throw new LayoutSuggestionError(403, "forbidden", "Only the card creator can request a layout suggestion.");
  }

  const canvas = { width: positiveInt(card.width, 1080), height: positiveInt(card.height, 1080) };
  const spec = parseJson<Record<string, unknown>>(card.cardSpecJson, {});
  const layers = extractLayers(spec);
  if (layers.length === 0) throw new LayoutSuggestionError(400, "no_layout_layers", "Card has no existing layers to arrange.");

  const [rule, palette] = await Promise.all([
    card.ruleVersionAtSave ? database.select().from(brandRuleVersions).where(eq(brandRuleVersions.id, card.ruleVersionAtSave)).limit(1).then((rows: any[]) => rows[0] ?? null) : null,
    resolveActivePalette({ explicitPaletteId: card.paletteId ?? null }, database),
  ]);
  return {
    cardId: card.id,
    canvas,
    layers,
    brandRules: rule ? parseJson<unknown[]>(rule.rulesJson, []) : [],
    paletteColors: parsePaletteColors(palette).map((color) => ({ name: color.name, role: color.role, hex: color.hex })),
  };
}

async function callLayoutModel(
  context: LayoutContext,
  apiKey: string,
  database: any,
  quote: Awaited<ReturnType<typeof checkCost>>,
  agentRunId: string | null,
): Promise<unknown> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": "magpie-worker-layout/1.0" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are Magpie's layout assistant. Return only valid JSON.",
            "Suggest geometry for existing card layers only. Do not add, remove, rename, or invent layers.",
            "Keep every box inside the canvas. Preserve readable hierarchy, alignment, spacing, and brand-safe composition.",
            "JSON shape: {\"layers\":[{\"id\":\"existing id\",\"x\":0,\"y\":0,\"width\":100,\"height\":100,\"rotation\":0}],\"rationale\":\"short reason\"}.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(context) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : "Layout suggestion failed.";
    throw new LayoutSuggestionError(502, "layout_suggestion_failed", message);
  }
  await writeCost(database, quote, agentRunId);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LayoutSuggestionError(502, "invalid_layout_suggestion", "Layout model returned no JSON content.");
  return parseModelJson(content);
}

function validateSuggestion(raw: unknown, context: LayoutContext): LayoutSuggestion {
  if (!isRecord(raw) || !Array.isArray(raw.layers)) {
    throw new LayoutSuggestionError(502, "invalid_layout_suggestion", "Layout model returned invalid JSON.");
  }
  const existing = new Set(context.layers.map((layer) => layer.id));
  const byId = new Map<string, SuggestedLayerGeometry>();
  for (const item of raw.layers) {
    if (!isRecord(item) || typeof item.id !== "string" || !existing.has(item.id)) continue;
    const x = finiteNumber(item.x);
    const y = finiteNumber(item.y);
    const width = finiteNumber(item.width);
    const height = finiteNumber(item.height);
    if (x === null || y === null || width === null || height === null) continue;
    const box = clampBox({ id: item.id, x, y, width, height, rotation: finiteNumber(item.rotation) ?? undefined }, context.canvas);
    byId.set(box.id, box);
  }
  const layers = [...byId.values()];
  if (layers.length === 0) {
    throw new LayoutSuggestionError(502, "invalid_layout_suggestion", "Layout model returned no valid existing layer geometry.");
  }
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 800) : "";
  return { layers, rationale };
}

function extractLayers(spec: Record<string, unknown>): InputLayer[] {
  const rawLayers = Array.isArray(spec.layers) ? spec.layers : [];
  return rawLayers.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0) return [];
    const type = firstString(value.kind, value.type) ?? "unknown";
    const text = firstString(value.textValue, value.content, value.text);
    const name = firstString(value.name);
    const assetRole = firstString(value.assetRole, value.assetId, value.slot, value.role);
    return [{
      id: value.id.trim(),
      type,
      name: name ?? undefined,
      text: text ? text.slice(0, 180) : undefined,
      assetRole: assetRole ?? undefined,
      x: finiteNumber(value.x),
      y: finiteNumber(value.y),
      width: finiteNumber(value.width),
      height: finiteNumber(value.height),
      rotation: finiteNumber(value.rotation),
    }];
  });
}

function localSuggestion(context: LayoutContext): LayoutSuggestion {
  const margin = Math.round(Math.min(context.canvas.width, context.canvas.height) * 0.08);
  const usableWidth = Math.max(1, context.canvas.width - margin * 2);
  const rows = context.layers.map((layer, index) => {
    const height = Math.max(48, Math.round(context.canvas.height * (layer.type === "text" ? 0.12 : 0.24)));
    return clampBox({ id: layer.id, x: margin, y: margin + index * (height + margin / 2), width: usableWidth, height }, context.canvas);
  });
  return { layers: rows, rationale: "Balanced existing layers with consistent margins and vertical hierarchy." };
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through to the structured error below.
      }
    }
    throw new LayoutSuggestionError(502, "invalid_layout_suggestion", "Layout model returned malformed JSON.");
  }
}

function clampBox(box: SuggestedLayerGeometry, canvas: { width: number; height: number }): SuggestedLayerGeometry {
  const width = clamp(Math.round(box.width), 1, canvas.width);
  const height = clamp(Math.round(box.height), 1, canvas.height);
  const x = clamp(Math.round(box.x), 0, Math.max(0, canvas.width - width));
  const y = clamp(Math.round(box.y), 0, Math.max(0, canvas.height - height));
  const rotation = box.rotation === undefined ? undefined : clamp(Math.round(box.rotation), -180, 180);
  return rotation === undefined ? { id: box.id, x, y, width, height } : { id: box.id, x, y, width, height, rotation };
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}
