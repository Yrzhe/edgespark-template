import type { Context } from "hono";
import { getDefaultProvider, type LlmProvider } from "./provider";
import { buildPrompt } from "./prompt";
import { validateLlmOutput } from "./schema";
import { blockKeysFor, requiredHeroBlocksFor } from "./blockSchema";
import { assertBudgetAvailable, getFreshCache, logLlmEvent, parseRewrite, ttlFor, writeErrorCache, writeValidCache } from "./cache";
import { extractVisitor } from "../signals/extract";
import { promptSafeVisitor } from "../signals/privacy";
import { loadPublicContext } from "../publicData";

export async function streamAdapt(c: Context, provider: LlmProvider = getDefaultProvider()): Promise<Response> {
  const requestedCacheKey = c.req.query("cacheKey");
  if (!requestedCacheKey) return sse([event("error", { code: "cache_key_mismatch" }), event("done", { ok: false })]);
  const visitorPrivate = await extractVisitor(c);
  const visitor = promptSafeVisitor(visitorPrivate);
  const context = await loadPublicContext(visitor, visitorPrivate.hashes.visitorBucketHash);
  if (requestedCacheKey !== context.cacheKey) return sse([event("error", { code: "cache_key_mismatch" }), event("done", { ok: false })]);

  const cached = await getFreshCache(context.cacheKey);
  if (cached) {
    const rewrite = parseRewrite(cached.rewriteJson);
    await logLlmEvent({ eventType: "llm_cache_hit", themeId: cached.themeId, selectedThemeId: cached.selectedThemeId, cacheKey: cached.cacheKey, visitor });
    return sse(rewrite ? blockEvents(rewrite.blocks).concat(event("done", { ok: true, cached: true })) : [event("done", { ok: false, cached: true })]);
  }
  if (visitor.device === "bot") return sse([event("done", { ok: false, skipped: "bot" })]);
  const budget = await assertBudgetAvailable();
  if (!budget.ok) return sse([event("error", { code: "budget_exhausted", spentMicros: budget.spentMicros, budgetMicros: budget.budgetMicros }), event("done", { ok: false })]);

  try {
    const candidates = context.selection.candidates.map((row) => context.themes.find((theme) => theme.id === row.theme.id)).filter(Boolean) as typeof context.themes;
    const prompt = buildPrompt({ visitor, candidateThemes: candidates.length ? candidates : [context.theme], content: context.content });
    const result = await provider.chatJson(prompt, 8000);
    const selectedTheme = context.themes.find((theme) => theme.id === (result.json as { selectedThemeId?: string }).selectedThemeId) ?? context.theme;
    const allowedBlockKeys = blockKeysFor(selectedTheme.layoutKey, context.content.projects.map((project) => project.id));
    const validated = validateLlmOutput(result.json, { candidateThemeIds: prompt.candidateThemes.map((theme) => theme.id), allowedBlockKeys, requiredBlockKeys: requiredHeroBlocksFor(selectedTheme.layoutKey), projectIds: context.content.projects.map((project) => project.id) });
    if (!validated.ok) {
      await writeErrorCache(context.cacheKey, context.theme.id, visitor, context.hashes, result.model);
      await logLlmEvent({ eventType: "llm_error", themeId: context.theme.id, selectedThemeId: null, cacheKey: context.cacheKey, visitor });
      return sse([event("error", { code: validated.reason }), event("done", { ok: false })]);
    }
    await writeValidCache({ cacheKey: context.cacheKey, themeId: context.theme.id, selectedThemeId: validated.value.selectedThemeId, bucket: visitor, rewrite: validated.value, hashes: context.hashes, model: result.model, usage: result.usage, ttlMs: ttlFor(visitor) });
    await logLlmEvent({ eventType: "llm_request", themeId: context.theme.id, selectedThemeId: validated.value.selectedThemeId, cacheKey: context.cacheKey, visitor, ...result.usage });
    return sse([event("start", { ok: true }), ...blockEvents(validated.value.blocks), event("done", { ok: true, cached: false })]);
  } catch (error) {
    await writeErrorCache(context.cacheKey, context.theme.id, visitor, context.hashes, provider.model);
    await logLlmEvent({ eventType: "llm_error", themeId: context.theme.id, selectedThemeId: null, cacheKey: context.cacheKey, visitor });
    return sse([event("error", { code: "provider_error" }), event("done", { ok: false })]);
  }
}

function blockEvents(blocks: Record<string, string>): string[] {
  return Object.entries(blocks).map(([key, text]) => event("block", { key, text }));
}

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sse(chunks: string[]): Response {
  return new Response(chunks.join(""), {
    headers: {
      "Content-Type": "text/event-stream;charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
