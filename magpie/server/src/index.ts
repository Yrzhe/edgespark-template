import { Hono } from "hono";
import { publicRoutes } from "./routes/public";
import { meRoutes } from "./routes/me";
import { agentRunRoutes, cardRoutes } from "./routes/cards";
import { assetRoutes, adminAssetRoutes } from "./routes/assets";
import { createSession, listSessions, sessionRoutes } from "./routes/sessions";
import { paletteRoutes, managePaletteRoutes } from "./routes/palettes";
import { imagegenRoutes } from "./routes/imagegen";
import { imagegenBatchRoutes } from "./routes/imagegenBatch";
import { copyRoutes } from "./routes/copy";
import { manageRoutes } from "./routes/manage";
import { shareRoutes } from "./routes/shares";
import { logEvent } from "./lib/events";
import { approvedUserOrAgentKey } from "./middleware/managementAuth";

const app = new Hono();

app.onError((error, c) => {
  console.error(JSON.stringify({ level: "error", code: "unhandled", error: String(error) }));
  void logEvent("error", "unhandled", String(error), { route: c.req.path });
  return c.html("<!doctype html><title>Magpie unavailable</title><main><h1>Magpie is temporarily unavailable</h1><p>The server could not reach its data store. No chargeable operation was started.</p></main>", 503);
});

app.route("/api/me", meRoutes);
app.get("/api/public/sessions", approvedUserOrAgentKey, (c) => listSessions(c));
app.post("/api/public/sessions", approvedUserOrAgentKey, (c) => createSession(c));
app.route("/api/public", publicRoutes);
app.route("/api/public", shareRoutes);
app.route("/api/public", cardRoutes);
app.route("/api/public", assetRoutes);
app.route("/api/public", adminAssetRoutes);
app.route("/api/public", sessionRoutes);
app.route("/api/public", paletteRoutes);
app.route("/api/public/manage", managePaletteRoutes);
app.route("/api/public", imagegenRoutes);
app.route("/api/public", imagegenBatchRoutes);
app.route("/api/public", copyRoutes);
app.route("/api/public/agent", agentRunRoutes);
app.route("/api/public/manage", manageRoutes);

export default app;
