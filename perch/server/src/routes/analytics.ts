/**
 * Management analytics reads.
 *
 * Mounted at `/api/public/manage` after managementAuth.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { analyticsEvents, links, pages } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";

export const analyticsManageRoutes = new Hono<AppEnv>()
  .get("/pages/:pageId/analytics", async (c) => {
    const page = await loadPage(c);
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    const range = parseRange(c);
    if (!range.ok) return httpError(c, 400, "invalid_request", range.message);
    const { db } = await import("edgespark");
    const where = and(
      eq(analyticsEvents.pageId, page.id),
      gte(analyticsEvents.occurredAt, range.from),
      lte(analyticsEvents.occurredAt, range.to)
    );
    const [{ value: views } = { value: 0 }] = await db.select({ value: count() }).from(analyticsEvents)
      .where(and(where, eq(analyticsEvents.eventType, "view")));
    const [{ value: clicks } = { value: 0 }] = await db.select({ value: count() }).from(analyticsEvents)
      .where(and(where, eq(analyticsEvents.eventType, "click")));
    const topLinks = await db.select({
      linkId: analyticsEvents.linkId,
      title: links.title,
      value: count(),
    }).from(analyticsEvents)
      .leftJoin(links, eq(analyticsEvents.linkId, links.id))
      .where(and(where, eq(analyticsEvents.eventType, "click")))
      .groupBy(analyticsEvents.linkId, links.title)
      .orderBy(desc(count()))
      .limit(20);
    const referrers = await groupDimension(where, analyticsEvents.referrerHost);
    const devices = await groupDimension(where, analyticsEvents.deviceType);
    const countries = await groupDimension(where, analyticsEvents.country);
    const dailySeries = await groupDailySeries(where, range);
    return c.json({
      pageId: page.id,
      range,
      totals: { views, clicks, ctr: views > 0 ? clicks / views : 0 },
      dailySeries,
      topLinks,
      referrers,
      devices,
      countries,
    });
  })
  .get("/pages/:pageId/links/:linkId/analytics", async (c) => {
    const link = await loadLink(c);
    if (!link) return httpError(c, 404, "link_not_found", "Link not found.");
    const range = parseRange(c);
    if (!range.ok) return httpError(c, 400, "invalid_request", range.message);
    const pageId = c.req.param("pageId");
    if (!pageId) return httpError(c, 400, "invalid_request", "pageId is required.");
    const { db } = await import("edgespark");
    const [{ value: clicks } = { value: 0 }] = await db.select({ value: count() }).from(analyticsEvents)
      .where(and(
        eq(analyticsEvents.pageId, pageId),
        eq(analyticsEvents.linkId, link.id),
        eq(analyticsEvents.eventType, "click"),
        gte(analyticsEvents.occurredAt, range.from),
        lte(analyticsEvents.occurredAt, range.to)
      ));
    return c.json({ pageId: link.pageId, linkId: link.id, range, totals: { clicks } });
  });

async function groupDimension(
  where: unknown,
  column: typeof analyticsEvents.referrerHost | typeof analyticsEvents.deviceType | typeof analyticsEvents.country
) {
  const { db } = await import("edgespark");
  return db.select({
    value: sql<string>`coalesce(${column}, 'unknown')`,
    count: count(),
  }).from(analyticsEvents)
    .where(where as never)
    .groupBy(column)
    .orderBy(desc(count()))
    .limit(20);
}

async function groupDailySeries(where: unknown, range: { from: number; to: number }) {
  const { db } = await import("edgespark");
  const dayExpr = sql<string>`strftime('%Y-%m-%d', ${analyticsEvents.occurredAt} / 1000, 'unixepoch')`;
  const rows = await db.select({
    day: dayExpr,
    eventType: analyticsEvents.eventType,
    count: count(),
  }).from(analyticsEvents)
    .where(where as never)
    .groupBy(dayExpr, analyticsEvents.eventType);

  const byDay = new Map<string, { views: number; clicks: number }>();
  for (const row of rows) {
    const bucket = byDay.get(row.day) ?? { views: 0, clicks: 0 };
    if (row.eventType === "view") bucket.views = row.count;
    if (row.eventType === "click") bucket.clicks = row.count;
    byDay.set(row.day, bucket);
  }

  return utcDays(range.from, range.to).map((day) => {
    const bucket = byDay.get(day) ?? { views: 0, clicks: 0 };
    return { day, views: bucket.views, clicks: bucket.clicks };
  });
}

function utcDays(from: number, to: number): string[] {
  const days: string[] = [];
  const start = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

function startOfUtcDay(value: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

async function loadPage(c: Context) {
  const { db } = await import("edgespark");
  const pageId = c.req.param("pageId");
  if (!pageId) return null;
  return (await db.select().from(pages)
    .where(and(eq(pages.id, pageId), isNull(pages.deletedAt)))
    .limit(1))[0] ?? null;
}

async function loadLink(c: Context) {
  const { db } = await import("edgespark");
  const pageId = c.req.param("pageId");
  const linkId = c.req.param("linkId");
  if (!pageId || !linkId) return null;
  return (await db.select().from(links)
    .where(and(eq(links.id, linkId), eq(links.pageId, pageId), isNull(links.deletedAt)))
    .limit(1))[0] ?? null;
}

function parseRange(c: Context): { ok: true; from: number; to: number } | { ok: false; message: string } {
  const now = Date.now();
  const from = Number(c.req.query("from") ?? now - 30 * 24 * 60 * 60 * 1000);
  const to = Number(c.req.query("to") ?? now);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
    return { ok: false, message: "from/to must be epoch-ms integers with to >= from." };
  }
  if (to - from > 180 * 24 * 60 * 60 * 1000) {
    return { ok: false, message: "Range is limited to 180 days for raw analytics queries." };
  }
  return { ok: true, from, to };
}
