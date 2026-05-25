import { Hono } from "hono";
import { and, asc, eq, gte } from "drizzle-orm";
import { contestantTotals, upstreamCache, voteBuckets } from "@defs";
import { INGEST_SNAPSHOTS_RESOURCE, parseCachedPayload, toEpochMs, type SnapshotsPayload } from "../lib/ingest";
import { cumulativeBuckets, isAllRange, isLifetimeRange, parseIds, rangeMs, resample, topIdsByMetric } from "../lib/series";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";
import { numberish } from "../lib/upstream";

export const seriesRoutes = new Hono()
  .get("/votes/series", async (c) => {
    const { db } = await import("edgespark");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    const range = c.req.query("range");
    const allRange = isAllRange(range);
    const since = allRange ? (comp.startsAt ?? 0) : Math.max(Date.now() - rangeMs(range), comp.startsAt ?? 0);
    const explicitIds = parseIds(c.req.query("ids"));
    const totals = await db.select().from(contestantTotals).where(eq(contestantTotals.seasonId, comp.activeSeasonId));
    const ids = explicitIds ?? topIdsByMetric(
      totals,
      (row) => row.contestantId,
      (row) => row.total
    );
    const rows = await db
      .select()
      .from(voteBuckets)
      .where(and(eq(voteBuckets.seasonId, comp.activeSeasonId), gte(voteBuckets.bucketStart, since)))
      .orderBy(asc(voteBuckets.contestantId), asc(voteBuckets.bucketStart));
    const raw = cumulativeBuckets(rows);
    const now = Date.now();
    const baselineT = comp.startsAt ?? rows[0]?.bucketStart ?? Math.max(0, now - 1);
    const series = Object.fromEntries(ids.map((id) => [
      id,
      resampleWithLast(withVoteCurrentPoint(withVoteBaseline(raw[id] ?? [], baselineT), now), allRange ? 300 : 120),
    ]));
    return c.json({ series });
  })
  .get("/equity-series", async (c) => {
    const { db } = await import("edgespark");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    const [row] = await db.select().from(upstreamCache).where(eq(upstreamCache.resource, INGEST_SNAPSHOTS_RESOURCE)).limit(1);
    const payload = parseCachedPayload<SnapshotsPayload>(row?.payload);
    const agents = parseIds(c.req.query("ids")) ?? topIdsByMetric(
      Object.entries(payload?.snapshots ?? {}).map(([id, points]) => ({ id, equity: numberish(points.at(-1)?.equity) })),
      (row) => row.id,
      (row) => row.equity
    );
    const range = c.req.query("range");
    const allRange = isAllRange(range);
    const lifetimeRange = isLifetimeRange(range);
    const since = lifetimeRange ? Number.NEGATIVE_INFINITY : allRange ? (comp.startsAt ?? Number.NEGATIVE_INFINITY) : Date.now() - rangeMs(range);
    const series: Record<string, Array<{ t: number; equity: number }>> = {};
    for (const id of agents) {
      const points = payload?.snapshots?.[id] ?? [];
      series[id] = resample(
        points
          .map((p) => ({ t: toEpochMs(p.fetchedAt), equity: numberish(p.equity) }))
          .filter((p) => Number.isFinite(p.t) && p.t >= since),
        allRange || lifetimeRange ? 300 : 120
      );
    }
    return c.json({ series });
  });

function withVoteBaseline(points: Array<{ t: number; count: number }>, baselineT: number): Array<{ t: number; count: number }> {
  if (points[0]?.count === 0) return points;
  return [{ t: baselineT, count: 0 }, ...points];
}

function withVoteCurrentPoint(points: Array<{ t: number; count: number }>, now: number): Array<{ t: number; count: number }> {
  const last = points.at(-1);
  if (!last || now <= last.t) return points;
  return [...points, { t: now, count: last.count }];
}

function resampleWithLast<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const sampled = resample(points, Math.max(1, max - 1));
  const last = points.at(-1);
  return last === undefined || sampled.at(-1) === last ? sampled : [...sampled, last];
}
