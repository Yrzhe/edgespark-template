/**
 * EdgeSpark Site Host + BaaS — server entry.
 *
 * PATH CONVENTIONS (platform-enforced auth):
 *   /api/*          → login required (auth.user guaranteed)
 *   /api/public/*   → login optional (we enforce our own checks)
 *   /api/webhooks/* → no auth
 *
 * Foundation (Plan 1): /api/me, /api/me/token, and the managementAuth gate.
 * Plan 2 mounts: /api/public/manage/sites*, /api/public/s/:slug/*
 * Plan 3 mounts: /api/public/manage/sites/:id/collections*, /api/public/baas/:siteId/*
 */
import { Hono } from "hono";
import { vars, secret } from "edgespark";
import { auth } from "edgespark/http";
import { managementAuth, type AppEnv } from "./middleware/managementAuth";
import { signMgmtToken } from "./lib/mgmtToken";
import { httpError } from "./lib/httpErrors";
import { hostingManageRoutes, serveRoutes } from "./routes/hosting";
import { baasManageRoutes, baasRuntimeRoutes } from "./routes/baas";

const app = new Hono<AppEnv>();

// Session check (platform guarantees a user under /api/*).
app.get("/api/me", (c) => {
  if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
  return c.json({ email: auth.user.email });
});

// Owner mints a short-lived management token; the dashboard holds it in memory and
// sends it as `Authorization: Bearer` for management mutations.
app.get("/api/me/token", async (c) => {
  if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
  const ownerEmail = vars.get("OWNER_EMAIL");
  if (!ownerEmail || auth.user.email !== ownerEmail) {
    return httpError(c, 403, "not_owner", "Only the owner can mint a management token.");
  }
  const mgmtSecret = secret.get("MGMT_TOKEN_SECRET") ?? "";
  if (!mgmtSecret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
  const token = await signMgmtToken({ email: ownerEmail }, mgmtSecret, 900);
  return c.json({ token, expiresInSec: 900 });
});

// Gate all management routes (the mounted routers below inherit this middleware).
app.use("/api/public/manage/*", managementAuth);
app.get("/api/public/manage/_ping", (c) => c.json({ ok: true, principal: c.get("principal") }));

// Lane mounts (stubs today; filled by Plan 2 / Plan 3).
app.route("/api/public/manage", hostingManageRoutes); // sites, deploys, files, versions, keys
app.route("/api/public/manage", baasManageRoutes); // collections + records admin
app.route("/api/public/s", serveRoutes); // PUBLIC static serving
app.route("/api/public/baas", baasRuntimeRoutes); // PUBLIC BaaS runtime

export default app;
