/**
 * Perch — server entry.
 *
 * PATH CONVENTIONS:
 *   /api/*                login required by platform
 *   /api/public/*         login optional; app enforces checks
 *   /api/public/manage/*  gated by managementAuth
 */

import { Hono } from "hono";
import { auth } from "edgespark/http";
import { managementAuth, type AppEnv } from "./middleware/managementAuth";
import { signMgmtToken } from "./lib/mgmtToken";
import { isOwnerEmail, getMgmtSecret } from "./lib/ownerConfig";
import { httpError } from "./lib/httpErrors";
import { pagesManageRoutes } from "./routes/pages";
import { publicRoutes } from "./routes/public";
import { analyticsManageRoutes } from "./routes/analytics";

const app = new Hono<AppEnv>();

app.get("/api/me", (c) => {
  if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
  return c.json({ email: auth.user.email });
});

app.get("/api/me/token", async (c) => {
  if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
  const email = auth.user.email;
  if (!email || !isOwnerEmail(email)) {
    return httpError(c, 403, "not_owner", "Only the owner can mint a management token.");
  }
  const mgmtSecret = getMgmtSecret();
  if (!mgmtSecret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
  const token = await signMgmtToken({ email }, mgmtSecret, 900);
  return c.json({ token, expiresInSec: 900 });
});

app.use("/api/public/manage/*", managementAuth);
app.get("/api/public/manage/_ping", (c) => c.json({ ok: true, principal: c.get("principal") }));

app.route("/api/public/manage", pagesManageRoutes);
app.route("/api/public/manage", analyticsManageRoutes);
app.route("/api/public", publicRoutes);

export default app;
