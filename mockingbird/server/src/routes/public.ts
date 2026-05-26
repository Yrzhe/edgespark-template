import { Hono } from "hono";
import type { Context } from "hono";
import { analyticsEvents } from "@defs";
import { buildLlmsTxt } from "../lib/llms";
import { newId } from "../lib/ids";
import { extractVisitor } from "../lib/signals/extract";
import { promptSafeVisitor } from "../lib/signals/privacy";
import { renderPublicPage } from "../lib/publicPage/html";
import { renderPreviewPage } from "../lib/publicPage/html";
import { loadPublicContext } from "../lib/publicData";
import { getFreshCache, parseRewrite } from "../lib/llm/cache";
import { streamAdapt } from "../lib/llm/stream";
import { verifyPreviewToken } from "../lib/previewToken";
import type { VisitorPromptSafe } from "../lib/signals/types";

export const publicRoutes = new Hono()
  .get("/llms.txt", (c) => docs(c))
  .get("/agent.md", (c) => docs(c, "text/markdown;charset=utf-8"))
  .get("/site", async (c) => renderSite(c))
  .get("/adapt/stream", (c) => streamAdapt(c))
  .post("/view", async (c) => {
    await insertView(c, null, null, null);
    return c.json({ ok: true });
  });

export async function renderSite(c: Context): Promise<Response> {
  const visitor = await extractVisitor(c);
  const preview = await previewSignals(c);
  const safe = preview ?? promptSafeVisitor(visitor);
  const context = await loadPublicContext(safe, preview ? "preview-share" : visitor.hashes.visitorBucketHash);
  const cached = await getFreshCache(context.cacheKey);
  const rewrite = cached ? parseRewrite(cached.rewriteJson) : null;
  await insertView(c, context.theme.id, rewrite?.selectedThemeId ?? context.theme.id, context.cacheKey, visitor);
  const html = preview ? renderPreviewPage(context.theme, context.content, context.cacheKey, rewrite) : renderPublicPage(context.theme, context.content, context.cacheKey, rewrite);
  return c.html(html, 200, { "Cache-Control": "no-store" });
}

async function insertView(c: Context, themeId: string | null, selectedThemeId: string | null, cacheKey: string | null, existingVisitor?: Awaited<ReturnType<typeof extractVisitor>> | null) {
  try {
    const { db, ctx } = await import("edgespark");
    const visitor = existingVisitor ?? await extractVisitor(c);
    const safe = promptSafeVisitor(visitor);
    const event = { id: newId(), eventType: "view", occurredAt: Date.now(), themeId, selectedThemeId, cacheKey, country: safe.country, langRoot: safe.langRoot, device: safe.device, referrerRoot: safe.referrerRoot, hourBand: safe.hourBand, isReturning: safe.isReturning ? 1 : 0, botScore: safe.device === "bot" ? 80 : 0, isOwner: isOwnerRequest(c) ? 1 : 0, userAgentHash: visitor.hashes.userAgentHash, visitorBucketHash: visitor.hashes.visitorBucketHash, tokenIn: 0, tokenOut: 0, costMicros: 0 };
    ctx.runInBackground(db.insert(analyticsEvents).values(event));
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", code: "analytics_insert_failed", error: String(error) }));
  }
}

async function previewSignals(c: Context): Promise<VisitorPromptSafe | null> {
  const token = new URL(c.req.url).searchParams.get("as");
  if (!token) return null;
  const { ctx } = await import("edgespark");
  const verified = await verifyPreviewToken(token);
  if (verified.ok && isVisitorSafe(verified.signals)) return verified.signals;
  if ((ctx.environment as string) === "dev") return { country: null, langRoot: null, device: "unknown", referrerRoot: "direct", hourBand: "unknown", isReturning: false, isWeekend: false, urlSource: token.slice(0, 32) };
  return null;
}

function isVisitorSafe(value: unknown): value is VisitorPromptSafe {
  return typeof value === "object" && value !== null && "device" in value && "referrerRoot" in value;
}

function isOwnerRequest(c: Context): boolean {
  return /(?:^|;\s*)mb_owner=1(?:;|$)/.test(c.req.header("Cookie") ?? "");
}

async function docs(c: Context, contentType = "text/plain;charset=utf-8"): Promise<Response> {
  return new Response(buildLlmsTxt(await publicOrigin(c)), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" } });
}

async function publicOrigin(c: Context): Promise<string> {
  void c;
  const { vars } = await import("edgespark");
  const configured = vars.get("PUBLIC_BASE_URL");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall through to the neutral placeholder instead of reflecting headers.
    }
  }
  return "https://example.com";
}
