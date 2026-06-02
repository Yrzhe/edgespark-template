import { db as edgeDb } from "edgespark";
import { and, eq } from "drizzle-orm";
import { assets } from "@defs";
import { checkCost, writeCost, type CostQuoteItem } from "../cost";
import { triggerAssetDescription } from "../description/autotag";
import { logEvent } from "../events";
import { newId } from "../ids";
import { isRecord, parseJson } from "../json";
import { getDailyBudgetUsd, getOpenAiApiKey } from "../ownerConfig";
import { resolveActivePalette } from "../palettes";
import { buildStyleInheritancePrefix, type BatchModel, type BrandStyle } from "./batch";
import { buildImagegenPrompt, generateImageOnly, IMAGEGEN_UNIT_MICROS, validateDims, type ImageDims, type ImagegenMode } from "./openai";
import { parseReferenceAssetIds, resolveReferenceAssets } from "./references";
import { plannedMediaS3Uri, storeGeneratedPng } from "./store";

export interface PendingBatchAssetInput {
  userId: string;
  prompt: string;
  count: number;
  model: BatchModel;
  transparent: boolean;
  style: BrandStyle;
  dims?: ImageDims | null;
  folderId?: string | null;
  agentRunId?: string | null;
  referenceAssetIds?: string[] | null;
}

export interface MaterializeResult {
  status: "ready" | "pending" | "failed" | "not_found";
  asset: any | null;
  error?: string;
}

export async function reservePendingBatchAssets(input: PendingBatchAssetInput, database: any = edgeDb): Promise<{ assetIds: string[]; requested: number; mode: ImagegenMode }> {
  const mode: ImagegenMode = input.transparent ? "transparent" : "opaque";
  const dims = input.dims ?? defaultDims(mode);
  validateDims(dims);

  const palette = await resolveActivePalette({}, database);
  const prefix = buildStyleInheritancePrefix(input.style);
  const userIntent = prefix ? `${prefix}${input.prompt}` : input.prompt;
  const fullPrompt = buildImagegenPrompt(userIntent, mode, palette);
  const now = Date.now();
  const assetIds: string[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const id = newId("asset");
    assetIds.push(id);
    await database.insert(assets).values({
      id,
      kind: "image",
      source: "agent-gen",
      folderId: input.folderId ?? null,
      ownerUserId: input.userId,
      agentRunId: input.agentRunId ?? null,
      name: derivePendingName(input.prompt, index),
      s3Uri: plannedMediaS3Uri(id),
      contentType: "image/png",
      byteSize: 0,
      status: "generating",
      width: dims.width,
      height: dims.height,
      transparent: mode === "transparent" ? 1 : 0,
      tagsJson: JSON.stringify(["agent-gen", "batch", mode]),
      provenanceJson: JSON.stringify({
        prompt: fullPrompt,
        userPrompt: input.prompt,
        mode,
        model: input.model,
        paletteId: palette.id,
        batch: true,
        lazyMaterialize: true,
        batchIndex: index,
        dims,
        agentRunId: input.agentRunId ?? null,
        ...(input.referenceAssetIds?.length ? { referenceAssetIds: input.referenceAssetIds } : {}),
      }),
      createdAt: now,
      updatedAt: now,
    });
  }

  return { assetIds, requested: input.count, mode };
}

export async function materializePendingAsset(assetId: string, database: any = edgeDb): Promise<MaterializeResult> {
  const [row] = await database.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!row || row.deletedAt) return { status: "not_found", asset: null };
  if (row.status === "ready") return { status: "ready", asset: row };
  if (row.status === "failed") return { status: "failed", asset: row };

  const provenance = parseJson<Record<string, unknown>>(row.provenanceJson, {});
  if (!isLazyPending(provenance)) return { status: "pending", asset: row };
  if (row.status === "rendering" && !renderingIsStale(row)) return { status: "pending", asset: row };

  const claim = await database
    .update(assets)
    .set({ status: "rendering", updatedAt: Date.now() })
    .where(and(eq(assets.id, assetId), eq(assets.status, row.status === "rendering" ? "rendering" : "generating")));
  if (affectedRows(claim) === 0) {
    const [latest] = await database.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    return { status: latest?.status === "ready" ? "ready" : "pending", asset: latest ?? row };
  }

  try {
    const mode = parseMode(provenance.mode);
    const model = parseModel(provenance.model, mode);
    const dims = parseDims(provenance.dims, mode);
    const userId = String(row.ownerUserId || provenance.userId || "");
    if (!userId) throw new Error("asset_owner_missing");
    const agentRunId = typeof row.agentRunId === "string" ? row.agentRunId : typeof provenance.agentRunId === "string" ? provenance.agentRunId : null;
    const prompt = typeof provenance.prompt === "string" && provenance.prompt.trim() ? provenance.prompt : String(provenance.userPrompt ?? "");
    if (!prompt.trim()) throw new Error("prompt_missing");
    const referenceAssetIds = Array.isArray(provenance.referenceAssetIds) && provenance.referenceAssetIds.length === 0 ? null : parseReferenceAssetIds(provenance.referenceAssetIds);
    if (referenceAssetIds?.length && model !== "gpt-image-1") throw new Error("reference_images_require_gpt_image_1");
    const referenceAssets = await resolveReferenceAssets(userId, referenceAssetIds, database);

    const quoteItem: CostQuoteItem = { provider: "openai", operation: `openai.imagegen.${model}`, units: 1, unitMicros: IMAGEGEN_UNIT_MICROS };
    const capMicros = Math.round(getDailyBudgetUsd() * 1_000_000);
    const quote = await checkCost(database, userId, [quoteItem], Date.now(), capMicros);
    if (!quote.allowed) throw new Error("budget_exhausted");

    const png = await generateImageOnly({ prompt, dims, mode, model, quality: "high", apiKey: getOpenAiApiKey(), referenceAssets });
    const s3Uri = await storeGeneratedPng(assetId, png);
    const nextProvenance = JSON.stringify({ ...provenance, materializedAt: Date.now(), byteSize: png.byteLength });
    await database
      .update(assets)
      .set({
        status: "ready",
        s3Uri,
        byteSize: png.byteLength,
        width: dims.width,
        height: dims.height,
        transparent: mode === "transparent" ? 1 : 0,
        provenanceJson: nextProvenance,
        updatedAt: Date.now(),
      })
      .where(eq(assets.id, assetId));
    await writeCost(database, quote, agentRunId);
    triggerAssetDescription({ assetId, s3Uri, userId, agentRunId }, database);
    const [ready] = await database.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    return { status: "ready", asset: ready ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database.update(assets).set({ status: "generating", updatedAt: Date.now() }).where(eq(assets.id, assetId)).catch(() => undefined);
    void logEvent("warn", "asset_materialize_failed", "Pending asset materialization failed", {
      userId: row.ownerUserId ?? undefined,
      route: "/api/public/assets/:id",
      meta: { assetId, agentRunId: row.agentRunId ?? provenance.agentRunId ?? null, error: message },
    });
    const [latest] = await database.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    return { status: "pending", asset: latest ?? row, error: message };
  }
}

export function pendingAssetIsLazy(row: any): boolean {
  const provenance = parseJson<Record<string, unknown>>(row?.provenanceJson, {});
  return isLazyPending(provenance);
}

function isLazyPending(provenance: Record<string, unknown>): boolean {
  return provenance.lazyMaterialize === true && provenance.batch === true;
}

function renderingIsStale(row: any): boolean {
  const updatedAt = Number(row.updatedAt ?? row.createdAt ?? 0);
  return Date.now() - updatedAt > 90_000;
}

function parseMode(value: unknown): ImagegenMode {
  return value === "opaque" ? "opaque" : "transparent";
}

function parseModel(value: unknown, mode: ImagegenMode): BatchModel {
  if (value === "gpt-image-1" || value === "gpt-image-2") return value;
  return mode === "transparent" ? "gpt-image-1" : "gpt-image-2";
}

function parseDims(value: unknown, mode: ImagegenMode): ImageDims {
  if (isRecord(value) && Number.isInteger(value.width) && Number.isInteger(value.height)) {
    return { width: Number(value.width), height: Number(value.height) };
  }
  return defaultDims(mode);
}

function defaultDims(mode: ImagegenMode): ImageDims {
  return mode === "transparent" ? { width: 1024, height: 1024 } : { width: 1024, height: 1024 };
}

function derivePendingName(prompt: string, index: number): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  const base = (trimmed.length > 40 ? trimmed.slice(0, 40) : trimmed) || "Batch generated asset";
  return `${base} #${index + 1}`;
}

function affectedRows(result: unknown): number {
  if (typeof result !== "object" || result === null) return 0;
  const r = result as Record<string, any>;
  return Number.isInteger(r.rowsAffected) ? r.rowsAffected : Number.isInteger(r.changes) ? r.changes : Number.isInteger(r.meta?.changes) ? r.meta.changes : 0;
}
