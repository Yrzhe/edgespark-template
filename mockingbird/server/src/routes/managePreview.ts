import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { previewRateLimits } from "@defs";
import type { VisitorPromptSafe } from "../lib/signals/types";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { loadPublicContext } from "../lib/publicData";
import { buildPrompt } from "../lib/llm/prompt";
import { getDefaultProvider } from "../lib/llm/provider";
import { validateLlmOutput } from "../lib/llm/schema";
import { blockKeysFor, requiredHeroBlocksFor } from "../lib/llm/blockSchema";
import { signPreviewToken } from "../lib/previewToken";
import { assertBudgetAvailable, logLlmEvent } from "../lib/llm/cache";
import { newId } from "../lib/ids";

export const previewManageRoutes = new Hono<AppEnv>()
  .post("/preview", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "Request body must be JSON.");
    const visitor = fakeVisitor(body.signals);
    const context = await loadPublicContext(visitor, "preview");
    let rewrite = null;
    if (body.rewrite === true && visitor.device !== "bot") {
      const limited = await consumePreviewQuota(principalKey(c));
      if (!limited.ok) return httpError(c, 429, "preview_rate_limited", "Preview rewrite rate limit exceeded.");
      const budget = await assertBudgetAvailable();
      if (!budget.ok) return httpError(c, 429, "budget_exhausted", "Daily LLM budget exhausted.");
      const candidates = context.selection.candidates.map((row) => context.themes.find((theme) => theme.id === row.theme.id)).filter(Boolean) as typeof context.themes;
      const prompt = buildPrompt({ visitor, candidateThemes: candidates.length ? candidates : [context.theme], content: context.content });
      const result = await getDefaultProvider().chatJson(prompt, 8000);
      const selectedTheme = context.themes.find((theme) => theme.id === (result.json as { selectedThemeId?: string }).selectedThemeId) ?? context.theme;
      const valid = validateLlmOutput(result.json, { candidateThemeIds: prompt.candidateThemes.map((theme) => theme.id), allowedBlockKeys: blockKeysFor(selectedTheme.layoutKey, context.content.projects.map((project) => project.id)), requiredBlockKeys: requiredHeroBlocksFor(selectedTheme.layoutKey), projectIds: context.content.projects.map((project) => project.id) });
      if (valid.ok) rewrite = valid.value;
      await logLlmEvent({ eventType: "preview", themeId: context.theme.id, selectedThemeId: valid.ok ? valid.value.selectedThemeId : null, cacheKey: null, visitor, ...result.usage, isOwner: c.get("principal")?.kind === "owner" });
    }
    return c.json({ visitor, theme: context.theme, candidates: context.selection.candidates.map((row) => ({ id: row.theme.id, score: row.score })), cacheKey: context.cacheKey, rewrite });
  })
  .post("/preview/share", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "Request body must be JSON.");
    const ttlSec = Math.max(60, Math.min(Number(body.ttlSec ?? 86400), 86400));
    const token = await signPreviewToken({ signals: fakeVisitor(body.signals), ttlSec });
    if (!token) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    return c.json({ token, ttlSec, robots: "noindex,nofollow", url: `/?as=${encodeURIComponent(token)}` }, 201);
  });

function fakeVisitor(raw: unknown): VisitorPromptSafe {
  const record = isRecord(raw) ? raw : {};
  return {
    country: typeof record.country === "string" && /^[A-Z]{2}$/.test(record.country) ? record.country : null,
    langRoot: typeof record.langRoot === "string" && /^[a-z]{2,3}$/.test(record.langRoot) ? record.langRoot : null,
    device: pick(record.device, ["desktop", "mobile", "tablet", "bot", "unknown"], "unknown"),
    referrerRoot: pick(record.referrerRoot, ["direct", "github", "hn", "x", "xiaohongshu", "instagram", "substack", "medium", "search", "email", "other"], "direct"),
    hourBand: pick(record.hourBand, ["morning", "day", "evening", "late_night", "unknown"], "unknown"),
    isReturning: Boolean(record.isReturning),
    isWeekend: Boolean(record.isWeekend),
    urlSource: typeof record.urlSource === "string" && /^[a-z0-9_-]{1,32}$/.test(record.urlSource) ? record.urlSource : null,
  };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

async function readJson(c: any): Promise<unknown> { try { return await c.req.json(); } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function principalKey(c: any): string {
  const principal = c.get("principal");
  return principal?.kind === "agent" ? `agent:${principal.keyId}` : "owner";
}

async function consumePreviewQuota(principal: string): Promise<{ ok: true } | { ok: false }> {
  const { db } = await import("edgespark");
  const windowStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const [row] = await db.select().from(previewRateLimits).where(and(eq(previewRateLimits.principalKey, principal), eq(previewRateLimits.windowStart, windowStart))).limit(1);
  if (row && row.count >= 20) return { ok: false };
  if (row) {
    await db.update(previewRateLimits).set({ count: row.count + 1, updatedAt: Date.now() }).where(eq(previewRateLimits.id, row.id));
  } else {
    await db.insert(previewRateLimits).values({ id: newId(), principalKey: principal, windowStart, count: 1, updatedAt: Date.now() });
  }
  return { ok: true };
}
