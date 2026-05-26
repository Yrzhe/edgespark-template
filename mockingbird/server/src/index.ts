import { Hono } from "hono";
import { managementAuth, type AppEnv } from "./middleware/managementAuth";
import { themesManageRoutes } from "./routes/manageThemes";
import { contentManageRoutes } from "./routes/manageContent";
import { imagesManageRoutes } from "./routes/manageImages";
import { previewManageRoutes } from "./routes/managePreview";
import { analyticsManageRoutes } from "./routes/manageAnalytics";
import { publicRoutes } from "./routes/public";
import { meRoutes } from "./routes/me";
import { emergencyFallbackPage } from "./lib/publicPage/html";

const app = new Hono<AppEnv>();

app.onError((error, c) => {
  console.warn(JSON.stringify({ level: "warn", code: "unhandled_error", path: c.req.path, error: String(error) }));
  if (c.req.method === "GET" && (c.req.path === "/" || c.req.path === "/api/public/site")) {
    return c.html(emergencyFallbackPage(), 200, { "Cache-Control": "no-store" });
  }
  return c.json({ error: { code: "internal_error", message: "Request failed." } }, 500);
});

// NOTE: bare `/` is owned by EdgeSpark static assets (SPA fallback) in both dev (Vite) and
// production (CF Workers Static Assets). Public visitor page is served at /api/public/site;
// the SPA at `/` either renders empty or fetches /api/public/site for client-side hydration.
app.route("/api/me", meRoutes);
app.use("/api/public/manage/*", managementAuth);
app.get("/api/public/manage/_ping", (c) => c.json({ ok: true, principal: c.get("principal") }));
app.route("/api/public/manage", themesManageRoutes);
app.route("/api/public/manage", contentManageRoutes);
app.route("/api/public/manage", imagesManageRoutes);
app.route("/api/public/manage", previewManageRoutes);
app.route("/api/public/manage", analyticsManageRoutes);
app.route("/api/public", publicRoutes);

export default app;
