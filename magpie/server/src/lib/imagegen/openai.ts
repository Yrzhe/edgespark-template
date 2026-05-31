import { db } from "edgespark";
import { checkCost, type CostQuoteItem, writeCost } from "../cost";
import { logEvent } from "../events";
import { httpError } from "../httpErrors";
import { getDailyBudgetUsd, getOpenAiApiKey, isDevEnv } from "../ownerConfig";
import { parsePaletteColors, resolveActivePalette } from "../palettes";

export type ImagegenMode = "transparent" | "opaque";
export type ImageDims = { width: number; height: number };

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
export const IMAGEGEN_UNIT_MICROS = 80_000;
const IMAGEGEN_QUOTE: CostQuoteItem = { provider: "openai", operation: "openai.imagegen.gpt-image-2", units: 1, unitMicros: IMAGEGEN_UNIT_MICROS };

// Read-only pre-call budget guard (no ledger write). Lets a caller (e.g. the async agent
// generate_asset tool) reject an over-budget request synchronously before offloading the
// real, ledger-writing imagegenCreate to a background task. Uses the same quote + cap as
// imagegenCreate so the two never disagree.
export async function imagegenCheckBudget(userId: string) {
  const capMicros = Math.round(getDailyBudgetUsd() * 1_000_000);
  return checkCost(db, userId, [IMAGEGEN_QUOTE], Date.now(), capMicros);
}

export async function imagegenCreate(input: { prompt: string; dims: ImageDims; mode?: ImagegenMode; activePaletteId?: string | null; userId: string; quality?: "medium" | "high" }) {
  validateDims(input.dims);
  const mode = input.mode ?? inferMode(input.prompt, input.dims);
  const capMicros = Math.round(getDailyBudgetUsd() * 1_000_000);
  const quote = await checkCost(db, input.userId, [IMAGEGEN_QUOTE], Date.now(), capMicros);
  if (!quote.allowed) {
    void logEvent("warn", "cost_429", "Imagegen budget exhausted", { userId: input.userId, meta: { operation: IMAGEGEN_QUOTE.operation, remainingMicros: quote.remainingMicros } });
    const error = new Error("budget_exhausted") as Error & { status?: number; quote?: unknown };
    error.status = 429;
    error.quote = quote;
    throw error;
  }

  const palette = await resolveActivePalette({ explicitPaletteId: input.activePaletteId }, db);
  const prompt = buildImagegenPrompt(input.prompt, mode, palette);
  const model = mode === "transparent" ? "gpt-image-1" : "gpt-image-2";
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    if (!isDevEnv()) throw new Error("openai_api_key_missing");
    await writeCost(db, quote, null);
    return { png: devPngBytes(), mode, prompt, quote, paletteId: palette.id, contentType: "image/png", model };
  }
  const png = await generateImageOnly({ prompt, dims: input.dims, mode, model, quality: input.quality ?? "high", apiKey });
  await writeCost(db, quote, null);
  return { png, mode, prompt, quote, paletteId: palette.id, contentType: "image/png", model };
}

// Pure OpenAI image call with no cost/db side effects. Reused by single + batch imagegen.
// Returns the dev placeholder PNG when no API key is configured in a dev environment.
export async function generateImageOnly(input: { prompt: string; dims: ImageDims; mode: ImagegenMode; model: string; quality?: "medium" | "high"; apiKey: string | null }): Promise<Uint8Array> {
  if (!input.apiKey) {
    if (!isDevEnv()) throw new Error("openai_api_key_missing");
    return devPngBytes();
  }
  const payload = {
    model: input.model,
    prompt: input.prompt,
    size: `${input.dims.width}x${input.dims.height}`,
    background: input.mode === "transparent" ? "transparent" : "opaque",
    output_format: "png",
    quality: input.quality ?? "high",
    n: 1,
  };
  const response = await fetch(OPENAI_IMAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${input.apiKey}`, "User-Agent": "magpie-worker-imagegen/3.0" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : "OpenAI image generation failed.";
    throw new Error(message);
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new Error("openai_image_missing");
  return base64ToBytes(b64);
}

export function buildImagegenPrompt(userIntent: string, mode: ImagegenMode, paletteRow: { colorsJson: string; kind?: string }): string {
  const colors = parsePaletteColors(paletteRow).map((color) => `${color.name} ${color.hex} (${color.role})`).join("\n");
  const coralTail = paletteRow.kind === "canonical" ? "\n- Coral cutout figures preferred for human/animal silhouettes" : "";
  const modeTail = mode === "transparent"
    ? "Output: transparent background, isolated subject, no shadow, no border. PNG with alpha channel."
    : "Output: full poster / scene composition. Background uses palette primary as full-bleed surface; subject + text live on top. Edges fill to the frame; no border treatment.";
  return `Active palette (must be respected exactly):\n${colors}\n\nVisual DNA (Bloome):\n- Matisse paper-cut style figures with thick ink outlines (#0C0A0F, 3-5px relative weight)\n- Organic hand-drawn scribbles for accents (leaf, petal, seed, sprout, spark, dot, squiggle)\n- Warm editorial, not corporate tech${coralTail}\n\nHard rules (anti-AI-slop):\n- No purple/violet gradients\n- No glassmorphism, no chrome\n- No 3D rendered orbs / brains / circuits\n- No stock-photo composites\n- No generic SaaS-undraw vector flat illustration\n- No robot avatars\n\n${modeTail}\n\n${userIntent}`;
}

export function inferMode(prompt: string, dims: ImageDims): ImagegenMode {
  const p = prompt.toLowerCase();
  if (dims.width <= 1024 && dims.height <= 1024 && /(icon|cutout|sticker|silhouette|小素材)/i.test(p)) return "transparent";
  if (dims.width >= 1080 || dims.height >= 1350 || /(poster|slide|hero|海报)/i.test(p)) return "opaque";
  return "transparent";
}

export function validateDims(dims: ImageDims): void {
  if (!Number.isInteger(dims.width) || !Number.isInteger(dims.height) || dims.width <= 0 || dims.height <= 0) throw new Error("invalid_dims");
  if (dims.width % 16 !== 0 || dims.height % 16 !== 0 || Math.max(dims.width, dims.height) > 3840) throw new Error("invalid_dims");
}

export function imagegenErrorResponse(c: Parameters<typeof httpError>[0], error: unknown) {
  const e = error as Error & { status?: number; quote?: unknown };
  if (e.status === 429) return httpError(c, 429, "budget_exhausted", "Daily image generation budget would be exceeded.", { quote: e.quote });
  return httpError(c, 502, "imagegen_failed", e.message || "Image generation failed.");
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function devPngBytes(): Uint8Array {
  return base64ToBytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv3CJwAAAABJRU5ErkJggg==");
}
