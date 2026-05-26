import { Hono } from "hono";
import { and, eq, gte, lte, lt } from "drizzle-orm";
import { analyticsEvents, visitorCache } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { rollupDay } from "../lib/analytics/rollup";

export const analyticsManageRoutes = new Hono<AppEnv>()
  .get("/analytics", async (c) => analytics(c, null))
  .get("/analytics/themes/:themeId", async (c) => analytics(c, c.req.param("themeId")))
  .post("/analytics/rollup", async (c) => {
    const day = c.req.query("day");
    const dayStart = day ? Date.parse(`${day}T00:00:00.000Z`) : startOfUtcDay(Date.now() - 24 * 60 * 60_000);
    if (!Number.isFinite(dayStart)) return httpError(c, 400, "invalid_request", "day must be YYYY-MM-DD.");
    return c.json(await rollupDay(dayStart));
  })
  .get("/cache", async (c) => {
    const { db } = await import("edgespark");
    const filters = [];
    if (c.req.query("themeId")) filters.push(eq(visitorCache.themeId, c.req.query("themeId")!));
    if (c.req.query("status")) filters.push(eq(visitorCache.status, c.req.query("status")!));
    const rows = await db.select().from(visitorCache).where(filters.length ? and(...filters) : undefined).limit(100);
    return c.json({ cache: rows });
  })
  .delete("/cache", async (c) => {
    const { db } = await import("edgespark");
    const filters = [];
    if (c.req.query("themeId")) filters.push(eq(visitorCache.themeId, c.req.query("themeId")!));
    if (c.req.query("status")) filters.push(eq(visitorCache.status, c.req.query("status")!));
    if (!filters.length) return httpError(c, 400, "invalid_request", "At least one filter is required.");
    const rows = await db.delete(visitorCache).where(and(...filters)).returning({ id: visitorCache.id });
    return c.json({ deleted: rows.length });
  });

async function analytics(c: any, themeId: string | null) {
  const { db } = await import("edgespark");
  const includeBots = c.req.query("includeBots") === "true";
  const includeOwner = c.req.query("includeOwner") === "1" || c.req.query("includeOwner") === "true";
  const from = Number(c.req.query("from") ?? Date.now() - 30 * 24 * 60 * 60_000);
  const to = Number(c.req.query("to") ?? Date.now());
  const filters = [gte(analyticsEvents.occurredAt, from), lte(analyticsEvents.occurredAt, to)];
  if (themeId) filters.push(eq(analyticsEvents.themeId, themeId));
  if (!includeBots) filters.push(lt(analyticsEvents.botScore, 30));
  if (!includeOwner) filters.push(eq(analyticsEvents.isOwner, 0));
  const rows = await db.select().from(analyticsEvents).where(and(...filters));
  const views = rows.filter((row) => row.eventType === "view").length;
  const llmRequests = rows.filter((row) => row.eventType === "llm_request").length;
  const cacheHits = rows.filter((row) => row.eventType === "llm_cache_hit").length;
  const failCounts = countBy(rows.filter((row) => row.eventType === "llm_error"), "eventType");
  return c.json({
    range: { from, to },
    kpis: {
      views,
      llmRequests,
      cacheHits,
      cacheHitRate: llmRequests + cacheHits === 0 ? 0 : cacheHits / (llmRequests + cacheHits),
      costMicros: rows.reduce((sum, row) => sum + row.costMicros, 0),
      tokenIn: rows.reduce((sum, row) => sum + row.tokenIn, 0),
      tokenOut: rows.reduce((sum, row) => sum + row.tokenOut, 0),
    },
    themeDistribution: countBy(rows, "themeId"),
    signals: {
      country: countBy(rows, "country"),
      device: countBy(rows, "device"),
      referrer: countBy(rows, "referrerRoot"),
      language: countBy(rows, "langRoot"),
      hourBand: countBy(rows, "hourBand"),
    },
    failCounts,
    filters: { includeBots, includeOwner, ownerTrafficExcluded: !includeOwner, themeId },
  });
}

function countBy(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = String(row[key] ?? "none");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
