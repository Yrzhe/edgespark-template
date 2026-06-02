import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { assets, brandRuleVersions, cards } from "@defs";
import { buildPresignedGetPlaceholder, triggerAssetDescription } from "../description/autotag";
import { logEvent } from "../events";
import { newId } from "../ids";
import { parseJson } from "../json";
import { imagegenCheckBudget, imagegenCreate, type ImagegenMode } from "../imagegen/openai";
import {
  emptyStyle,
  MAX_BATCH_COUNT,
  resolveCardStyle,
  type BatchModel,
} from "../imagegen/batch";
import { reservePendingBatchAssets } from "../imagegen/materialize";
import { plannedMediaS3Uri, storeGeneratedPng } from "../imagegen/store";

// R6 agent tool-use surface. Each tool has an OpenAI function-calling schema and a
// server-side executor. Executors enforce team-scoping / ownership themselves; the agent
// run is already gated by approvedUserOrAgentKey, so the principal here is always an
// approved user, an owner, or a scoped agent API key (never anonymous/pending).
//
// IMPORTANT: executors read the whole table then filter in JS (not SQL LIKE) so the same
// code path works against D1 in prod and the in-memory test mock (which only supports `=`).

export interface ToolContext {
  userId: string;
  isOwner: boolean;
  runId: string | null;
  cardId?: string | null;
}

export interface ToolResult {
  success: boolean;
  result: unknown;
  // A trimmed view safe to stream to the client over SSE (no raw R2 URIs, no secrets).
  resultPreview: Record<string, unknown>;
  error?: string;
}

// OpenAI tool/function definitions. Kept deliberately small (V1 = these 7).
export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_asset",
      description:
        "Fuzzy-search the team asset library by the gpt-4o-mini vision description, name and tags. Use this to find existing images before generating new ones.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language description of the asset to find, e.g. 'a cat' or 'coral leaf cutout'." },
          limit: { type: "integer", description: "Max number of assets to return (default 10).", minimum: 1, maximum: 50 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_asset",
      description: "Return the full description and metadata for a single asset by its assetId.",
      parameters: {
        type: "object",
        properties: { assetId: { type: "string", description: "The asset id, e.g. asset_xxx." } },
        required: ["assetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_asset",
      description:
        "Generate exactly one brand-on image with the active palette and Bloome visual DNA, store it in the asset library, and return the new assetId once it is ready (status=\"ready\", bytes persisted). This call renders the image before it returns. Do not call this repeatedly for multiple options; use batch_generate whenever the user asks for more than one generated image.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "What to draw. The server prepends the active palette + Bloome DNA automatically." },
          transparent: { type: "boolean", description: "true → transparent cutout PNG; false → opaque full-bleed scene (default false)." },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_generate",
      description:
        "Reserve 1 to 6 brand-on image variations as pending assetIds and return immediately. The pixels materialize lazily when each pending asset is polled. Use this instead of repeated generate_asset calls whenever the user asks for multiple images, options, variants, or a count greater than 1.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Shared prompt for the batch. The server prepends active palette, card style, and Bloome DNA automatically." },
          count: { type: "integer", description: `Number of images to generate. Maximum ${MAX_BATCH_COUNT}.`, minimum: 1, maximum: MAX_BATCH_COUNT },
          transparent: { type: "boolean", description: "true -> transparent cutout PNGs; false -> opaque full-bleed images (default false)." },
          cardId: { type: "string", description: "Optional card id for style inheritance. Defaults to the open card for this run when present." },
          model: { type: "string", enum: ["gpt-image-1", "gpt-image-2"], description: "Optional image model override. Defaults from transparent mode." },
        },
        required: ["prompt", "count"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brand_rules",
      description: "Return the brand rules (canonical palette colors, clearspace/letterform thresholds) that apply to the given card.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "string", description: "The card id, e.g. card_xxx." } },
        required: ["cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_card_layers",
      description: "Return the current layers (text/asset/background) of a card so you can decide what to add or change.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "string", description: "The card id, e.g. card_xxx." } },
        required: ["cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_layer_to_card",
      description: "Add a new layer (text, asset image, or background) to a card at the given position. Coordinates are in canvas pixels from the top-left.",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "The card id to add the layer to." },
          layer: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "asset", "bg"], description: "Layer kind." },
              text: { type: "string", description: "Text content (required for type=text)." },
              assetId: { type: "string", description: "Asset id to place (required for type=asset)." },
              x: { type: "number", description: "Left position in px." },
              y: { type: "number", description: "Top position in px." },
              width: { type: "number", description: "Width in px." },
              height: { type: "number", description: "Height in px." },
              opacity: { type: "number", description: "0..1 (default 1)." },
              decoration: { type: "string", enum: ["none", "solid", "wavy", "dashed", "dotted"], description: "Text underline decoration (default none)." },
            },
            required: ["type", "x", "y", "width", "height"],
          },
        },
        required: ["cardId", "layer"],
      },
    },
  },
] as const;

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.function.name);

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  try {
    const result = await dispatch(name, args, ctx);
    void logEvent("info", "agent_tool_call", `agent tool ${name}`, {
      userId: ctx.userId,
      route: "/api/public/agent/runs",
      meta: { runId: ctx.runId, tool: name, args: summarizeArgs(args), success: result.success },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void logEvent("warn", "agent_tool_call", `agent tool ${name} failed`, {
      userId: ctx.userId,
      route: "/api/public/agent/runs",
      meta: { runId: ctx.runId, tool: name, args: summarizeArgs(args), success: false, error: message },
    });
    return { success: false, result: { error: message }, resultPreview: { error: message }, error: message };
  }
}

async function dispatch(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "search_asset":
      return searchAsset(args, ctx);
    case "describe_asset":
      return describeAsset(args, ctx);
    case "generate_asset":
      return generateAsset(args, ctx);
    case "batch_generate":
      return batchGenerate(args, ctx);
    case "get_brand_rules":
      return getBrandRules(args);
    case "get_card_layers":
      return getCardLayers(args);
    case "add_layer_to_card":
      return addLayerToCard(args, ctx);
    default:
      return { success: false, result: { error: "unknown_tool" }, resultPreview: { error: "unknown_tool" }, error: `unknown_tool:${name}` };
  }
}

async function searchAsset(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return fail("query is required");
  const limit = clampLimit(args.limit, 10);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = (await db.select().from(assets)).filter((a: any) => !a.deletedAt);
  const scored = rows
    .map((a: any) => ({ a, score: scoreAsset(a, terms) }))
    .filter((entry: { score: number }) => entry.score > 0)
    .sort((x: { score: number }, y: { score: number }) => y.score - x.score)
    .slice(0, limit)
    .map(({ a }: { a: any }) => ({
      assetId: a.id,
      name: a.name,
      description: a.description ?? null,
      thumbnail: buildPresignedGetPlaceholder(a.s3Uri),
    }));
  return ok({ assets: scored, count: scored.length }, { tool: "search_asset", count: scored.length, assetIds: scored.map((s) => s.assetId) });
}

function scoreAsset(a: any, terms: string[]): number {
  const haystack = `${a.name ?? ""} ${a.description ?? ""} ${(parseJson<string[]>(a.tagsJson, []) ?? []).join(" ")}`.toLowerCase();
  if (terms.length === 0) return 1;
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 1;
  return score;
}

async function describeAsset(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const assetId = String(args.assetId ?? "");
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!row || row.deletedAt) return fail("asset_not_found");
  const detail = {
    assetId: row.id,
    name: row.name,
    description: row.description ?? null,
    descriptionStatus: row.description ? "ready" : "pending",
    kind: row.kind,
    source: row.source,
    width: row.width ?? null,
    height: row.height ?? null,
    transparent: Number(row.transparent) === 1,
    tags: parseJson<string[]>(row.tagsJson, []),
    thumbnail: buildPresignedGetPlaceholder(row.s3Uri),
  };
  return ok(detail, { tool: "describe_asset", assetId: row.id, descriptionStatus: detail.descriptionStatus });
}

// M-102 (R10 — true fix). R9 made generate_asset return immediately and offloaded the 5-40s
// render to a SECOND, nested waitUntil. That second background dies past the Worker window just
// like the first did, so the asset got stuck in status="generating" forever — the same orphan,
// relocated from the run to the asset.
//
// R10: render INLINE inside the tool call. The agent run is already a long-lived waitUntil with
// a 90s global watchdog, so awaiting the render here (then storing to R2 and flipping to
// status="ready") costs the same wall-clock the model would otherwise wait on — but with NO
// second dying background. The asset is READY before the tool returns, so when the run finishes
// the image is already usable. If the render genuinely exceeds the per-tool watchdog the row is
// left as "generating" and the read-time reconcile (reconcileAssetRow) converts it to "failed"
// after a threshold — never an infinite spinner. Budget is pre-checked synchronously.
async function generateAsset(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return fail("prompt is required");
  const mode: ImagegenMode = args.transparent === true ? "transparent" : "opaque";
  const dims = { width: 1024, height: 1024 };

  // Pre-call cost guard (read-only). Reject before we create a row or spend any cost.
  const budget = await imagegenCheckBudget(ctx.userId);
  if (!budget.allowed) return fail("budget_exhausted");

  const id = newId("asset");
  const now = Date.now();
  // Insert a generating row first (s3_uri pre-set to the deterministic key). It exists for at
  // most the inline render; if this tool is abandoned by the watchdog mid-render, the reconcile
  // layer marks this row failed instead of leaving it stuck.
  await db.insert(assets).values({
    id,
    kind: "image",
    source: "agent-gen",
    folderId: null,
    ownerUserId: ctx.userId,
    name: deriveAssetName(prompt),
    s3Uri: plannedMediaS3Uri(id),
    contentType: "image/png",
    byteSize: 0,
    status: "generating",
    width: dims.width,
    height: dims.height,
    transparent: mode === "transparent" ? 1 : 0,
    tagsJson: JSON.stringify(["agent-gen", mode]),
    provenanceJson: JSON.stringify({ prompt, mode, agentRunId: ctx.runId }),
    createdAt: now,
    updatedAt: now,
  });

  try {
    // Inline render + R2 put + flip ready — the asset is fully ready before we return.
    const gen = await imagegenCreate({ prompt, dims, mode, userId: ctx.userId, quality: "medium" });
    const s3Uri = await storeGeneratedPng(id, gen.png);
    await db
      .update(assets)
      .set({
        status: "ready",
        s3Uri,
        byteSize: gen.png.byteLength,
        transparent: gen.mode === "transparent" ? 1 : 0,
        provenanceJson: JSON.stringify({ prompt, mode: gen.mode, paletteId: gen.paletteId, agentRunId: ctx.runId }),
        updatedAt: Date.now(),
      })
      .where(eq(assets.id, id));
    // Auto-description is non-critical and failure-tolerant — it is the ONLY thing left in the
    // background, and it never gates the asset's readiness or previewUrl.
    triggerAssetDescription({ assetId: id, s3Uri, userId: ctx.userId, agentRunId: ctx.runId });
    return ok({ assetId: id, status: "ready", mode: gen.mode }, { tool: "generate_asset", assetId: id, status: "ready", mode: gen.mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(assets)
      .set({ status: "failed", provenanceJson: JSON.stringify({ prompt, mode, agentRunId: ctx.runId, error: message }), updatedAt: Date.now() })
      .where(eq(assets.id, id))
      .catch(() => undefined);
    void logEvent("error", "agent_asset_gen_failed", message, { userId: ctx.userId, route: "/api/public/agent/runs", meta: { runId: ctx.runId, assetId: id } });
    return fail(message);
  }
}

// M-200 Approach A: reserve pending asset rows and return fast. Pixel generation is deliberately
// NOT run inside the agent waitUntil; each asset materializes later on its own GET/poll request.
async function batchGenerate(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return fail("prompt is required");
  const count = Number(args.count);
  if (!Number.isInteger(count) || count < 1) return fail("count must be an integer >= 1");
  if (count > MAX_BATCH_COUNT) return fail(`count must be <= ${MAX_BATCH_COUNT}`);

  const transparent = args.transparent === true;
  const model = parseBatchModel(args.model, transparent);
  const cardId = firstString(args.cardId, ctx.cardId);
  let style = emptyStyle();
  if (cardId) {
    const resolved = await resolveCardStyle(db, ctx.userId, cardId);
    if (!resolved.found) return fail("card_not_found");
    style = resolved.style;
  }

  const result = await reservePendingBatchAssets(
    {
      userId: ctx.userId,
      prompt,
      count,
      model,
      transparent,
      style,
      dims: { width: 1024, height: 1024 },
      folderId: null,
      agentRunId: ctx.runId,
    },
    db,
  );
  return ok(result, {
    tool: "batch_generate",
    assetIds: result.assetIds,
    requested: result.requested,
    status: "generating",
  });
}

async function getBrandRules(args: Record<string, unknown>): Promise<ToolResult> {
  const cardId = String(args.cardId ?? "");
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card || card.deletedAt) return fail("card_not_found");
  const [rule] = await db.select().from(brandRuleVersions).where(eq(brandRuleVersions.id, card.ruleVersionAtSave)).limit(1);
  if (!rule) return fail("brand_rule_not_found");
  const colors = parseJson<Array<Record<string, unknown>>>(rule.canonicalPaletteJson, []);
  const rules = parseJson<Array<Record<string, unknown>>>(rule.rulesJson, []);
  const detail = {
    family: rule.family,
    version: rule.version,
    colors, // canonical palette: [{ role, hex }]
    rules, // clearspace / letterform / palette thresholds
  };
  return ok(detail, { tool: "get_brand_rules", cardId, colorCount: colors.length });
}

async function getCardLayers(args: Record<string, unknown>): Promise<ToolResult> {
  const cardId = String(args.cardId ?? "");
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card || card.deletedAt) return fail("card_not_found");
  const spec = parseJson<Record<string, unknown>>(card.cardSpecJson, {});
  const layers = Array.isArray(spec.layers) ? spec.layers : [];
  return ok({ cardId, layers }, { tool: "get_card_layers", cardId, layerCount: layers.length });
}

async function addLayerToCard(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const cardId = String(args.cardId ?? "");
  const layerInput = (args.layer ?? {}) as Record<string, unknown>;
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card || card.deletedAt) return fail("card_not_found");
  if (card.creatorUserId !== ctx.userId && !ctx.isOwner) return fail("forbidden");

  const type = String(layerInput.type ?? "");
  if (!["text", "asset", "bg"].includes(type)) return fail("invalid_layer_type");
  if (type === "text" && typeof layerInput.text !== "string") return fail("text required for text layer");
  if (type === "asset" && typeof layerInput.assetId !== "string") return fail("assetId required for asset layer");

  const spec = parseJson<Record<string, unknown>>(card.cardSpecJson, {});
  const existing = Array.isArray(spec.layers) ? spec.layers : [];
  const layer = buildLayer(type, layerInput);
  const nextSpec = { ...spec, layers: [...existing, layer] };
  const lockVersion = Number(card.lockVersion ?? 0);
  await db
    .update(cards)
    .set({ cardSpecJson: JSON.stringify(nextSpec), updatedAt: Date.now(), lockVersion: lockVersion + 1 })
    .where(eq(cards.id, cardId));
  return ok({ ok: true, cardId, layerId: layer.id, layerCount: existing.length + 1 }, { tool: "add_layer_to_card", cardId, layerId: layer.id, layerCount: existing.length + 1 });
}

function buildLayer(type: string, input: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: newId(type === "text" ? "l_text" : type === "asset" ? "l_asset" : "l_bg"),
    kind: type,
    name: type === "text" ? "Headline" : type === "asset" ? "Asset" : "Background",
    x: Number(input.x ?? 0),
    y: Number(input.y ?? 0),
    width: Number(input.width ?? 0),
    height: Number(input.height ?? 0),
    opacity: clampOpacity(input.opacity),
    visible: true,
    locked: false,
    decoration: typeof input.decoration === "string" ? input.decoration : "none",
  };
  if (type === "text") {
    base.textValue = String(input.text ?? "");
    base.content = String(input.text ?? "");
    base.font = "Inter 800";
  }
  if (type === "asset") base.assetId = String(input.assetId ?? "");
  return base;
}

// ---- helpers ----

function ok(result: unknown, resultPreview: Record<string, unknown>): ToolResult {
  return { success: true, result, resultPreview: { ...resultPreview, success: true } };
}

function fail(error: string): ToolResult {
  return { success: false, result: { error }, resultPreview: { error, success: false }, error };
}

function clampLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

function clampOpacity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function deriveAssetName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return (trimmed.length > 48 ? trimmed.slice(0, 48) : trimmed) || "Agent generated asset";
}

function parseBatchModel(value: unknown, transparent: boolean): BatchModel {
  if (value === "gpt-image-1" || value === "gpt-image-2") return value;
  return transparent ? "gpt-image-1" : "gpt-image-2";
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === "string" && v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return out;
}
