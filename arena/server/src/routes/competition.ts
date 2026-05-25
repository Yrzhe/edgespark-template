import { Hono } from "hono";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";

export const competitionRoutes = new Hono().get("/competition", async (c) => {
  const row = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  return c.json({
    status: row.status,
    title: row.title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    votingEnabled: row.votingEnabled === 1,
    commentsEnabled: row.commentsEnabled === 1,
    seasonId: row.activeSeasonId,
    upstreamBaseUrl: row.upstreamBaseUrl,
  });
});
