/**
 * HOSTING LANE (Plan 2) — owner/agent site management + public serving.
 *
 * Mounted in src/index.ts as:
 *   app.route("/api/public/manage", hostingManageRoutes)  // sites, deploys, files, versions, keys
 *   app.route("/api/public/s", serveRoutes)               // public static serving
 *
 * `hostingManageRoutes` is gated by managementAuth (applied to /api/public/manage/* in index.ts);
 * read `c.get("principal")`. `serveRoutes` is PUBLIC.
 *
 * Codex lane A fills these in per docs/implementation/2026-05-22-plan-2-hosting.md.
 * Do NOT edit src/defs/** or src/index.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/managementAuth";

export const hostingManageRoutes = new Hono<AppEnv>().get("/_hosting_stub", (c) =>
  c.json({ error: { code: "not_implemented", message: "hosting manage routes pending (Plan 2)", requestId: crypto.randomUUID() } }, 501)
);

export const serveRoutes = new Hono().get("/*", (c) =>
  c.json({ error: { code: "not_implemented", message: "serve route pending (Plan 2)", requestId: crypto.randomUUID() } }, 501)
);
