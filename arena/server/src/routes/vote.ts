import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { contestantTotals, contestants, voteBuckets } from "@defs";
import { httpError } from "../lib/httpErrors";
import { bucketStart, ensureCompetition, publicOriginFromHeaders } from "../lib/season";
import { clampCount } from "../lib/vote";

export const votesPublicRoutes = new Hono()
  .get("/votes", async (c) => {
    const { db } = await import("edgespark");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    const rows = await db.select().from(contestantTotals).where(eq(contestantTotals.seasonId, comp.activeSeasonId));
    return c.json({ seasonId: comp.activeSeasonId, totals: Object.fromEntries(rows.map((r) => [r.contestantId, r.total])) });
  });

export const voteWriteRoutes = new Hono()
  .post("/vote", async (c) => {
    const { auth } = await import("edgespark/http");
    if (!auth.user) return httpError(c, 401, "unauthorized", "Login required.");
    const body = await readJson(c.req.raw);
    if (!isRecord(body) || typeof body.contestantId !== "string") return httpError(c, 400, "invalid_request", "contestantId is required.");
    const { db } = await import("edgespark");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    if (comp.status !== "live" || comp.votingEnabled !== 1) return c.json({ error: "NOT_LIVE" }, 403);
    const [contestant] = await db.select().from(contestants).where(and(eq(contestants.id, body.contestantId), eq(contestants.hidden, 0))).limit(1);
    if (!contestant) return httpError(c, 400, "invalid_contestant", "Unknown or hidden contestant.");
    const count = clampCount(body.count);
    const nowBucket = bucketStart(Date.now());
    await db.batch([
      db
        .insert(voteBuckets)
        .values({ seasonId: comp.activeSeasonId, contestantId: contestant.id, bucketStart: nowBucket, count })
        .onConflictDoUpdate({ target: [voteBuckets.seasonId, voteBuckets.contestantId, voteBuckets.bucketStart], set: { count: sql`${voteBuckets.count} + ${count}` } }),
      db
        .insert(contestantTotals)
        .values({ seasonId: comp.activeSeasonId, contestantId: contestant.id, total: count })
        .onConflictDoUpdate({ target: [contestantTotals.seasonId, contestantTotals.contestantId], set: { total: sql`${contestantTotals.total} + ${count}` } }),
    ]);
    const [total] = await db.select().from(contestantTotals).where(and(eq(contestantTotals.seasonId, comp.activeSeasonId), eq(contestantTotals.contestantId, contestant.id))).limit(1);
    return c.json({ ok: true, total: total?.total ?? count });
  });

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
