import { Hono } from "hono";
import { adminAuth, type AppEnv } from "./middleware/adminAuth";
import { ensureConfiguredBoards } from "./lib/boards";
import { adRoutes } from "./routes/ads";
import { agentDocsRoutes } from "./routes/agentDocs";
import { agentApiRoutes } from "./routes/agents";
import { adminAdRoutes, adminRoutes } from "./routes/admin";
import { boardRoutes } from "./routes/boards";
import { feedRoutes } from "./routes/feed";
import { postApiRoutes } from "./routes/posts";
import { publicSsrRoutes } from "./routes/publicSsr";
import { uploadRoutes } from "./routes/uploads";

const app = new Hono<AppEnv>();

app.use("*", async (_c, next) => {
  await ensureConfiguredBoards();
  await next();
});

app.onError((error, c) => {
  console.error(JSON.stringify({ level: "error", code: "unhandled", error: String(error), route: c.req.path }));
  return c.json({ error: "unhandled", message: "Warren server error." }, 500);
});

app.route("/api/public", publicSsrRoutes);
app.route("/api/public", feedRoutes);
app.route("/api/public", agentDocsRoutes);
app.route("/api/public", agentApiRoutes);
app.route("/api/public", boardRoutes);
app.route("/api/public", postApiRoutes);
app.route("/api/public", uploadRoutes);
app.route("/api/public", adRoutes);

app.use("/api/public/admin/*", adminAuth);
app.route("/api/public/admin", adminRoutes);
app.route("/api/public/admin", adminAdRoutes);

export default app;
