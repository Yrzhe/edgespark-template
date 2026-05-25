import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { contestantTotals, contestants, upstreamCache } from "@defs";
import { coerceRecord, mergeContestants } from "../lib/contestants";
import { httpError } from "../lib/httpErrors";
import { INGEST_AGENTS_RESOURCE, parseCachedPayload, type UpstreamAgentPayload, type UpstreamAgent } from "../lib/ingest";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";

export const contestantsRoutes = new Hono()
  .get("/contestants", async (c) => {
    const data = await leaderboard(c.req.raw.headers, c.req.url);
    return c.json({ contestants: data });
  })
  .get("/contestants/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await leaderboard(c.req.raw.headers, c.req.url);
    const base = rows.find((row) => row.id === id);
    if (!base) return httpError(c, 404, "contestant_not_found", "Contestant not found.");
    const agent = (await latestAgents()).find((a) => a.id === id);
    return c.json({
      ...base,
      positions: agent?.positions ?? [],
      metrics: coerceRecord(agent?.metrics ?? {}),
      account: coerceRecord(agent?.account ?? {}),
    });
  });

export async function leaderboard(headers: Headers, requestUrl: string) {
  const { db, storage } = await import("edgespark");
  const comp = await ensureCompetition(publicOriginFromHeaders(headers, requestUrl));
  const agents = await latestAgents();
  const local = await db.select().from(contestants).orderBy(asc(contestants.sortOrder));
  const totals = await db.select().from(contestantTotals).where(eq(contestantTotals.seasonId, comp.activeSeasonId));
  const votesById = new Map(totals.map((row) => [row.contestantId, row.total]));
  const overrides = await Promise.all(local.map(async (row) => ({
    ...row,
    avatarUrl: row.avatarS3Uri ? await signedAvatarUrl(storage, row.avatarS3Uri) : null,
  })));
  return mergeContestants(agents, overrides, votesById);
}

async function latestAgents(): Promise<UpstreamAgent[]> {
  const { db } = await import("edgespark");
  const [row] = await db.select().from(upstreamCache).where(eq(upstreamCache.resource, INGEST_AGENTS_RESOURCE)).limit(1);
  return parseCachedPayload<UpstreamAgentPayload>(row?.payload)?.agents ?? [];
}

async function signedAvatarUrl(storage: typeof import("edgespark").storage, s3Uri: string): Promise<string | null> {
  const { buckets } = await import("@defs");
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.arenaMedia.bucket_name) return null;
  const { downloadUrl } = await storage.from(buckets.arenaMedia).createPresignedGetUrl(parsed.path, 900);
  return downloadUrl;
}
