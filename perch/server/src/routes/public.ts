/**
 * Public SSR, click redirect, view beacon, public config, and agent docs.
 *
 * Mounted at `/api/public`.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import { analyticsEvents, links, pages } from "@defs";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { buildLlmsTxt } from "../lib/llms";
import { renderPublicPage, type PublicTheme } from "../lib/publicPage/html";

type CfRequest = Request & {
  cf?: {
    country?: string | null;
    botManagement?: { score?: number | null } | null;
  };
};

export const publicRoutes = new Hono()
  .get("/llms.txt", (c) => agentDocsResponse(publicOrigin(c)))
  .get("/agent.md", (c) => agentDocsResponse(publicOrigin(c), "text/markdown;charset=utf-8"))
  .get("/p/:slug", async (c) => {
    const loaded = await loadPublishedPage(c.req.param("slug"));
    if (!loaded) return notFoundHtml();
    const imageUrls = await imageUrlsFor(loaded.page, loaded.links);
    await tryInsertEvent(c, { pageId: loaded.page.id, linkId: null, eventType: "view" });
    const html = renderPublicPage(loaded.page, loaded.links, parseTheme(loaded.page.themeJson), imageUrls);
    c.header("Cache-Control", "no-store");
    return c.html(html);
  })
  .get("/p/:pageSlug/l/:linkId", async (c) => {
    const { db } = await import("edgespark");
    const [page] = await db.select().from(pages)
      .where(and(eq(pages.slug, c.req.param("pageSlug")), isNull(pages.deletedAt)))
      .limit(1);
    if (!page || !page.publishedAt) return httpError(c, 404, "page_not_found", "Page not found.");
    const [link] = await db.select().from(links)
      .where(and(eq(links.id, c.req.param("linkId")), eq(links.pageId, page.id), isNull(links.deletedAt)))
      .limit(1);
    if (!link || link.isActive !== 1 || link.linkKind === "section" || !isHttpUrl(link.url)) {
      return httpError(c, 404, "link_not_found", "Link not found.");
    }
    await tryInsertEvent(c, { pageId: page.id, linkId: link.id, eventType: "click" });
    return c.redirect(link.url, 302);
  })
  .post("/p/:pageSlug/view", async (c) => {
    const loaded = await loadPublishedPage(c.req.param("pageSlug"));
    if (!loaded) return httpError(c, 404, "page_not_found", "Page not found.");
    await tryInsertEvent(c, { pageId: loaded.page.id, linkId: null, eventType: "view" });
    return c.json({ ok: true });
  })
  .get("/pages/:slug/config", async (c) => {
    const loaded = await loadPublishedPage(c.req.param("slug"));
    if (!loaded) return httpError(c, 404, "page_not_found", "Page not found.");
    const imageUrls = await imageUrlsFor(loaded.page, loaded.links);
    return c.json({
      page: publicPageJson(loaded.page, imageUrls),
      links: loaded.links.filter((link) => link.isActive === 1).map((link) => publicLinkJson(link, loaded.page.slug, imageUrls.thumbnails?.[link.id] ?? null)),
    });
  });

async function loadPublishedPage(slug: string) {
  const { db } = await import("edgespark");
  const [page] = await db.select().from(pages)
    .where(and(eq(pages.slug, slug), isNull(pages.deletedAt)))
    .limit(1);
  if (!page || !page.publishedAt) return null;
  const rows = await db.select().from(links)
    .where(and(eq(links.pageId, page.id), isNull(links.deletedAt)))
    .orderBy(asc(links.position), asc(links.createdAt));
  return { page, links: rows };
}

async function imageUrlsFor(page: typeof pages.$inferSelect, pageLinks: readonly (typeof links.$inferSelect)[]) {
  const avatar = await signedGetUrl(page.avatarS3Uri);
  const cover = await signedGetUrl(page.coverS3Uri);
  const thumbnails: Record<string, string | null> = {};
  await Promise.all(pageLinks.map(async (link) => {
    thumbnails[link.id] = await signedGetUrl(link.thumbnailS3Uri);
  }));
  return { avatar, cover, thumbnails };
}

async function signedGetUrl(s3Uri: string | null): Promise<string | null> {
  if (!s3Uri) return null;
  const { storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.perchMedia.bucket_name) return null;
  const { downloadUrl } = await storage.from(buckets.perchMedia).createPresignedGetUrl(parsed.path, 900);
  return downloadUrl;
}

async function insertEvent(
  c: Context,
  input: { pageId: string; linkId: string | null; eventType: "view" | "click" }
) {
  const { db, ctx } = await import("edgespark");
  const userAgent = c.req.header("User-Agent") ?? "";
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const event = {
    id: newId(),
    pageId: input.pageId,
    linkId: input.linkId,
    eventType: input.eventType,
    occurredAt: Date.now(),
    referrerHost: referrerHost(c.req.header("Referer")),
    deviceType: deviceType(userAgent),
    country: (c.req.raw as CfRequest).cf?.country ?? c.req.header("CF-IPCountry") ?? null,
    userAgentHash: userAgent ? await sha256Hex(userAgent) : null,
    ipHash: ip === "unknown" ? null : await sha256Hex(ip),
    botScore: botScore(c.req.raw as CfRequest, userAgent),
  };
  await db.insert(analyticsEvents).values(event);
  ctx.runInBackground(bestEffortRollup(event));
}

async function tryInsertEvent(
  c: Context,
  input: { pageId: string; linkId: string | null; eventType: "view" | "click" }
) {
  try {
    await insertEvent(c, input);
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", code: "analytics_insert_failed", error: String(error) }));
  }
}

async function bestEffortRollup(_event: { pageId: string; linkId: string | null; eventType: string; occurredAt: number }) {
  // TODO(scaffold): add dailyAnalyticsRollups increments when the dashboard needs rollups.
}

function publicPageJson(page: typeof pages.$inferSelect, imageUrls: Awaited<ReturnType<typeof imageUrlsFor>>) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    displayName: page.displayName,
    bio: page.bio,
    theme: parseTheme(page.themeJson),
    socialLinks: safeJson(page.socialLinksJson, []),
    avatarUrl: imageUrls.avatar,
    coverUrl: imageUrls.cover,
  };
}

function publicLinkJson(link: typeof links.$inferSelect, pageSlug: string, thumbnailUrl: string | null) {
  return {
    id: link.id,
    title: link.title,
    description: link.description,
    position: link.position,
    isFeatured: link.isFeatured === 1,
    linkKind: link.linkKind,
    thumbnailUrl,
    href: `/api/public/p/${encodeURIComponent(pageSlug)}/l/${encodeURIComponent(link.id)}`,
  };
}

function publicOrigin(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  return host ? `${proto}://${host}` : new URL(c.req.url).origin;
}

function agentDocsResponse(origin: string, contentType = "text/plain;charset=utf-8"): Response {
  return new Response(buildLlmsTxt(origin), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

function notFoundHtml(): Response {
  return new Response("<!doctype html><title>Not found</title><h1>Not found</h1>", {
    status: 404,
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseTheme(raw: string): PublicTheme {
  return safeJson(raw, {}) as PublicTheme;
}

function safeJson(raw: string, fallback: unknown): unknown {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function referrerHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try { return new URL(raw).host.slice(0, 120); } catch { return null; }
}

function deviceType(ua: string): "desktop" | "mobile" | "tablet" | "bot" | "unknown" {
  const s = ua.toLowerCase();
  if (!s) return "unknown";
  if (/bot|crawler|spider|preview|slurp/.test(s)) return "bot";
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobile|iphone|android/.test(s)) return "mobile";
  return "desktop";
}

function botScore(request: CfRequest, ua: string): number {
  const score = request.cf?.botManagement?.score;
  if (typeof score === "number") return score;
  return deviceType(ua) === "bot" ? 80 : 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
