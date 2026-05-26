import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { analyticsEvents, visitorCache } from "@defs";
import { db, vars } from "edgespark";
import { newId } from "../ids";
import type { VisitorPromptSafe } from "../signals/types";
import { composeCacheKey } from "../matcher/bucket";
import type { LlmRewrite } from "./schema";

export type CacheHashes = { contentHash: string; ruleHash: string; promptHash: string; modelKey: string };
export type CacheBucketInput = { themeOrTie: string; visitor: VisitorPromptSafe } & CacheHashes;

export function llmCacheKey(input: CacheBucketInput): string {
  return composeCacheKey(input);
}

export async function getFreshCache(cacheKey: string) {
  const now = Date.now();
  const [row] = await db.select().from(visitorCache).where(and(eq(visitorCache.cacheKey, cacheKey), eq(visitorCache.status, "fresh"), gte(visitorCache.expiresAt, now))).limit(1);
  if (!row) return null;
  await db.update(visitorCache).set({ lastHitAt: now }).where(eq(visitorCache.id, row.id));
  return row;
}

export async function writeValidCache(input: {
  cacheKey: string;
  themeId: string;
  selectedThemeId: string;
  bucket: unknown;
  rewrite: LlmRewrite;
  hashes: CacheHashes;
  model: string;
  usage: { tokenIn: number; tokenOut: number; costMicros: number };
  ttlMs: number;
}) {
  const now = Date.now();
  const values = {
    id: newId(),
    cacheKey: input.cacheKey,
    themeId: input.themeId,
    bucketJson: JSON.stringify(input.bucket),
    selectedThemeId: input.selectedThemeId,
    rewriteJson: JSON.stringify(input.rewrite),
    model: input.model,
    promptHash: input.hashes.promptHash,
    contentHash: input.hashes.contentHash,
    ruleHash: input.hashes.ruleHash,
    status: "fresh",
    tokenIn: input.usage.tokenIn,
    tokenOut: input.usage.tokenOut,
    costMicros: input.usage.costMicros,
    expiresAt: now + input.ttlMs,
    lastHitAt: now,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(visitorCache).values(values);
  } catch {
    await db.update(visitorCache).set({ ...values, id: undefined, createdAt: undefined }).where(eq(visitorCache.cacheKey, input.cacheKey));
  }
}

export async function writeErrorCache(cacheKey: string, themeId: string, bucket: unknown, hashes: CacheHashes, model: string): Promise<void> {
  const now = Date.now();
  try {
    await db.insert(visitorCache).values({
      id: newId(),
      cacheKey,
      themeId,
      bucketJson: JSON.stringify(bucket),
      selectedThemeId: null,
      rewriteJson: "{}",
      model,
      promptHash: hashes.promptHash,
      contentHash: hashes.contentHash,
      ruleHash: hashes.ruleHash,
      status: "error",
      tokenIn: 0,
      tokenOut: 0,
      costMicros: 0,
      expiresAt: now + 5 * 60_000,
      lastHitAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Another request already owns the bucket. Leave fallback in place.
  }
}

export function ttlFor(visitor: VisitorPromptSafe): number {
  return visitor.device === "bot" ? 6 * 60 * 60_000 : 24 * 60 * 60_000;
}

export async function dailySpendMicros(dayStart = startOfUtcDay(Date.now())): Promise<number> {
  const rows = await db.select({ costMicros: analyticsEvents.costMicros }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, dayStart), inArray(analyticsEvents.eventType, ["llm_request", "preview"])));
  return rows.reduce((sum, row) => sum + row.costMicros, 0);
}

export async function assertBudgetAvailable(): Promise<{ ok: true } | { ok: false; spentMicros: number; budgetMicros: number }> {
  const budgetUsd = Number(vars.get("DAILY_LLM_BUDGET_USD") ?? "2");
  const budgetMicros = Math.max(0, Math.floor((Number.isFinite(budgetUsd) ? budgetUsd : 2) * 1_000_000));
  const spentMicros = await dailySpendMicros();
  return spentMicros >= budgetMicros ? { ok: false, spentMicros, budgetMicros } : { ok: true };
}

export async function logLlmEvent(input: { eventType: "llm_request" | "llm_cache_hit" | "llm_error" | "preview"; themeId: string | null; selectedThemeId: string | null; cacheKey: string | null; visitor: VisitorPromptSafe; tokenIn?: number; tokenOut?: number; costMicros?: number; isOwner?: boolean }) {
  await db.insert(analyticsEvents).values({
    id: newId(),
    eventType: input.eventType,
    occurredAt: Date.now(),
    themeId: input.themeId,
    selectedThemeId: input.selectedThemeId,
    cacheKey: input.cacheKey,
    country: input.visitor.country,
    langRoot: input.visitor.langRoot,
    device: input.visitor.device,
    referrerRoot: input.visitor.referrerRoot,
    hourBand: input.visitor.hourBand,
    isReturning: input.visitor.isReturning ? 1 : 0,
    botScore: input.visitor.device === "bot" ? 80 : 0,
    isOwner: input.isOwner ? 1 : 0,
    userAgentHash: null,
    visitorBucketHash: null,
    tokenIn: input.tokenIn ?? 0,
    tokenOut: input.tokenOut ?? 0,
    costMicros: input.costMicros ?? 0,
  });
}

export async function hashObject(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function parseRewrite(raw: string): LlmRewrite | null {
  try { return JSON.parse(raw) as LlmRewrite; } catch { return null; }
}

export function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
