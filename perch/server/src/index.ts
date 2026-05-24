/**
 * Perch — server entry.
 *
 * PATH CONVENTIONS:
 *   /api/*                login required by platform
 *   /api/public/*         login optional; app enforces checks
 *   /api/public/manage/*  gated by managementAuth
 */

import { Hono } from "hono";
import { managementAuth, type AppEnv } from "./middleware/managementAuth";
import { pagesManageRoutes } from "./routes/pages";
import { publicRoutes } from "./routes/public";
import { analyticsManageRoutes } from "./routes/analytics";
import { meRoutes } from "./routes/me";

const app = new Hono<AppEnv>();

app.route("/api/me", meRoutes);

app.use("/api/public/manage/*", managementAuth);
app.get("/api/public/manage/_ping", (c) => c.json({ ok: true, principal: c.get("principal") }));

app.route("/api/public/manage", pagesManageRoutes);
app.route("/api/public/manage", analyticsManageRoutes);
app.route("/api/public", publicRoutes);

export default app;
