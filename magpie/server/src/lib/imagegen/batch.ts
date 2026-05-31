import { db as edgeDb } from "edgespark";
import { eq } from "drizzle-orm";
import { assets, brandRuleVersions, cards } from "@defs";
import { checkCost, writeCost, type CostQuote, type CostQuoteItem } from "../cost";
import { logEvent } from "../events";
import { newId } from "../ids";
import { getDailyBudgetUsd, getOpenAiApiKey } from "../ownerConfig";
import { isRecord, parseJson } from "../json";
import { resolveActivePalette } from "../palettes";
import { triggerAssetDescription } from "../description/autotag";
import { storeGeneratedPng } from "./store";
import { buildImagegenPrompt, generateImageOnly, IMAGEGEN_UNIT_MICROS, validateDims, type ImageDims, type ImagegenMode } from "./openai";

export const MAX_BATCH_COUNT = 6;
export const BATCH_CONCURRENCY_CAP = 3;

export type BatchModel = "gpt-image-1" | "gpt-image-2";

export interface BrandStyle {
  colors: string[];
  typography: string | null;
  spacing: string | null;
}

export interface BatchInput {
  prompt: string;
  count: number;
  model: BatchModel;
  transparent: boolean;
  cardId: string | null;
  dims: ImageDims | null;
  folderId: string | null;
}

export type ValidationResult = { ok: true; value: BatchInput } | { ok: false; code: string; message: string };

export function emptyStyle(): BrandStyle {
  return { colors: [], typography: null, spacing: null };
}

export function validateBatchInput(body: unknown): ValidationResult {
  if (!isRecord(body)) return { ok: false, code: "invalid_request", message: "JSON object body required." };
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) return { ok: false, code: "invalid_request", message: "prompt is required." };
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1) return { ok: false, code: "invalid_request", message: "count must be an integer >= 1." };
  if (count > MAX_BATCH_COUNT) return { ok: false, code: "count_exceeded", message: `count must be <= ${MAX_BATCH_COUNT}.` };
  const model: BatchModel | null = body.model === "gpt-image-1" ? "gpt-image-1" : body.model === "gpt-image-2" ? "gpt-image-2" : null;
  if (!model) return { ok: false, code: "invalid_model", message: "model must be 'gpt-image-1' or 'gpt-image-2'." };
  const transparent = body.transparent === true;
  const cardId = typeof body.cardId === "string" && body.cardId.length > 0 ? body.cardId : null;
  let dims: ImageDims | null = null;
  if (isRecord(body.dims) && typeof body.dims.width === "number" && typeof body.dims.height === "number") {
    dims = { width: body.dims.width, height: body.dims.height };
  }
  const folderId = typeof body.folderId === "string" && body.folderId.length > 0 ? body.folderId : null;
  return { ok: true, value: { prompt: body.prompt, count, model, transparent, cardId, dims, folderId } };
}

// Pulls brand style hints (colors / typography / spacing) from a card spec, falling
// back to the team brand-rules palette when the card spec carries no explicit colors.
export function extractBrandStyle(source: { cardSpecJson?: string | null; brandRulesJson?: string | null }): BrandStyle {
  const colors: string[] = [];
  let typography: string | null = null;
  let spacing: string | null = null;

  const spec = parseJson<Record<string, unknown> | null>(source.cardSpecJson ?? null, null);
  if (isRecord(spec)) {
    if (Array.isArray(spec.colors)) colors.push(...spec.colors.filter((c): c is string => typeof c === "string"));
    if (typeof spec.typography === "string") typography = spec.typography;
    else if (isRecord(spec.typography) && typeof spec.typography.font === "string") typography = spec.typography.font;
    if (typeof spec.spacing === "string") spacing = spec.spacing;
    else if (isRecord(spec.spacing) && typeof spec.spacing.scale === "string") spacing = spec.spacing.scale;
  }

  if (colors.length === 0) {
    const rules = parseJson<Record<string, unknown> | null>(source.brandRulesJson ?? null, null);
    if (isRecord(rules)) {
      const allowed = Array.isArray(rules.allowedColors) ? rules.allowedColors : Array.isArray(rules.colors) ? rules.colors : [];
      colors.push(...allowed.filter((c): c is string => typeof c === "string"));
    }
  }

  return { colors: dedupe(colors), typography, spacing };
}

// Builds the human-readable style-inheritance prefix injected ahead of the user intent,
// e.g. "in the style of palette #2556B6, #F36440, using Söhne typography aesthetic. ".
export function buildStyleInheritancePrefix(style: BrandStyle): string {
  const parts: string[] = [];
  if (style.colors.length > 0) parts.push(`in the style of palette ${style.colors.join(", ")}`);
  if (style.typography) parts.push(`using ${style.typography} typography aesthetic`);
  if (style.spacing) parts.push(`with ${style.spacing} spacing`);
  if (parts.length === 0) return "";
  return `${parts.join(", ")}. `;
}

// Resolves a card the caller may view (own card or any ready card) and derives its brand style.
export async function resolveCardStyle(database: any, userId: string, cardId: string): Promise<{ found: boolean; style: BrandStyle }> {
  const [card] = await database.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card || card.deletedAt || (card.status !== "ready" && card.creatorUserId !== userId)) return { found: false, style: emptyStyle() };
  const [activeRule] = await database.select().from(brandRuleVersions).where(eq(brandRuleVersions.active, 1)).limit(1);
  const style = extractBrandStyle({ cardSpecJson: card.cardSpecJson ?? null, brandRulesJson: activeRule?.rulesJson ?? null });
  return { found: true, style };
}

export interface RunBatchInput {
  userId: string;
  prompt: string;
  count: number;
  model: BatchModel;
  transparent: boolean;
  style: BrandStyle;
  dims?: ImageDims | null;
  folderId?: string | null;
  agentRunId?: string | null;
}

export interface BatchResult {
  assetIds: string[];
  totalCostMicros: number;
  generated: number;
  requested: number;
}

export async function runBatchImagegen(input: RunBatchInput, database: any = edgeDb): Promise<BatchResult> {
  const mode: ImagegenMode = input.transparent ? "transparent" : "opaque";
  const dims = input.dims ?? defaultDims(mode);
  validateDims(dims);

  // Batch-level pre-call cost guard: the whole request is denied if the daily budget
  // cannot cover all N images. Only successful generations are charged afterward.
  const capMicros = Math.round(getDailyBudgetUsd() * 1_000_000);
  const quoteItem = (): CostQuoteItem => ({ provider: "openai", operation: `openai.imagegen.${input.model}`, units: 1, unitMicros: IMAGEGEN_UNIT_MICROS });
  const preQuote = await checkCost(database, input.userId, Array.from({ length: input.count }, quoteItem), Date.now(), capMicros);
  if (!preQuote.allowed) {
    void logEvent("warn", "cost_429", "Batch imagegen budget exhausted", { userId: input.userId, meta: { requested: input.count, remainingMicros: preQuote.remainingMicros } });
    const error = new Error("budget_exhausted") as Error & { status?: number; quote?: unknown };
    error.status = 429;
    error.quote = preQuote;
    throw error;
  }

  const palette = await resolveActivePalette({}, database);
  const prefix = buildStyleInheritancePrefix(input.style);
  const userIntent = prefix ? `${prefix}${input.prompt}` : input.prompt;
  const fullPrompt = buildImagegenPrompt(userIntent, mode, palette);
  const apiKey = getOpenAiApiKey();
  const now = Date.now();

  const indices = Array.from({ length: input.count }, (_, i) => i);
  const pngs = await mapWithConcurrency(indices, BATCH_CONCURRENCY_CAP, async (index) => {
    try {
      return await generateImageOnly({ prompt: fullPrompt, dims, mode, model: input.model, quality: "high", apiKey });
    } catch (error) {
      void logEvent("error", "imagegen_batch_item", "Batch image generation failed", { userId: input.userId, meta: { index, error: error instanceof Error ? error.message : String(error) } });
      return null;
    }
  });
  const successes = pngs.filter((png): png is Uint8Array => png instanceof Uint8Array);

  // One cost-ledger row per successfully generated image (INSERT-only).
  if (successes.length > 0) {
    const chargeQuote: CostQuote = { ...preQuote, items: Array.from({ length: successes.length }, quoteItem), totalMicros: successes.length * IMAGEGEN_UNIT_MICROS, allowed: true };
    await writeCost(database, chargeQuote, input.agentRunId ?? null, now);
  }

  const assetIds: string[] = [];
  for (const png of successes) {
    const id = newId("asset");
    const s3Uri = await storeGeneratedPng(id, png);
    await database.insert(assets).values({
      id,
      kind: "image",
      source: "agent-gen",
      folderId: input.folderId ?? null,
      ownerUserId: input.userId,
      name: "Batch generated asset",
      s3Uri,
      contentType: "image/png",
      byteSize: png.byteLength,
      width: dims.width,
      height: dims.height,
      transparent: mode === "transparent" ? 1 : 0,
      tagsJson: JSON.stringify(["agent-gen", "batch", mode]),
      provenanceJson: JSON.stringify({ prompt: fullPrompt, mode, model: input.model, paletteId: palette.id, batch: true }),
      createdAt: now,
      updatedAt: now,
    });
    triggerAssetDescription({ assetId: id, s3Uri, userId: input.userId, agentRunId: input.agentRunId ?? null }, database);
    assetIds.push(id);
  }

  return { assetIds, totalCostMicros: successes.length * IMAGEGEN_UNIT_MICROS, generated: successes.length, requested: input.count };
}

function defaultDims(mode: ImagegenMode): ImageDims {
  return mode === "transparent" ? { width: 1024, height: 1024 } : { width: 1024, height: 1536 };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

// Bounded-concurrency map preserving input order. Caps in-flight OpenAI calls to avoid rate limits.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
