import { Hono } from "hono";
import { dailyRowsForContestant, formatDailyRows } from "../lib/daily";
import { httpError } from "../lib/httpErrors";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";

export const dailyRoutes = new Hono().get("/daily", async (c) => {
  const contestantId = c.req.query("contestantId");
  if (!contestantId) return httpError(c, 400, "invalid_request", "contestantId is required.");
  const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  const rows = await dailyRowsForContestant(comp.activeSeasonId, contestantId);
  return c.json({ days: formatDailyRows(rows) });
});
