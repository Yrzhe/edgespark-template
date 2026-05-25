import { Hono } from "hono";
import { managementAuth, type AppEnv } from "./middleware/managementAuth";
import { buildLlmsTxt } from "./lib/llms";
import { publicOriginFromHeaders } from "./lib/season";
import { commentsPublicRoutes, commentsWriteRoutes } from "./routes/comments";
import { competitionRoutes } from "./routes/competition";
import { contestantsRoutes } from "./routes/contestants";
import { dailyRoutes } from "./routes/daily";
import { decisionsRoutes } from "./routes/decisions";
import { ingestRoutes } from "./routes/ingest";
import { manageRoutes } from "./routes/manage";
import { meRoutes } from "./routes/me";
import { mockUpstreamRoutes } from "./routes/mock-upstream";
import { seriesRoutes } from "./routes/series";
import { votesPublicRoutes, voteWriteRoutes } from "./routes/vote";

const app = new Hono<AppEnv>();

app.use("/api/public/manage/*", managementAuth);
app.get("/api/public/manage/_ping", (c) => c.json({ ok: true, principal: c.get("principal") }));
app.route("/api/public/manage", manageRoutes);

app.get("/api/public/llms.txt", (c) => {
  const origin = publicOriginFromHeaders(c.req.raw.headers, c.req.url);
  return new Response(buildLlmsTxt(origin), {
    headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
});
app.route("/api/public", mockUpstreamRoutes);
app.route("/api/public", competitionRoutes);
app.route("/api/public", contestantsRoutes);
app.route("/api/public", votesPublicRoutes);
app.route("/api/public", seriesRoutes);
app.route("/api/public", dailyRoutes);
app.route("/api/public", decisionsRoutes);
app.route("/api/public", commentsPublicRoutes);
app.route("/api/public", ingestRoutes);

app.route("/api", meRoutes);
app.route("/api", voteWriteRoutes);
app.route("/api", commentsWriteRoutes);

export default app;
