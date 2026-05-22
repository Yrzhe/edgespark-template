/**
 * BaaS LANE (Plan 3) — collection/rule admin + public BaaS runtime.
 *
 * Mounted in src/index.ts as:
 *   app.route("/api/public/manage", baasManageRoutes)   // collections + records admin
 *   app.route("/api/public/baas", baasRuntimeRoutes)    // public per-collection-rule runtime
 *
 * `baasManageRoutes` is gated by managementAuth; read `c.get("principal")`.
 * `baasRuntimeRoutes` is PUBLIC; enforce per-collection read/write rules + rate limit per request.
 *
 * Codex lane B fills these in per docs/implementation/2026-05-22-plan-3-baas.md.
 * Do NOT edit src/defs/** or src/index.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/managementAuth";

export const baasManageRoutes = new Hono<AppEnv>().get("/_baas_admin_stub", (c) =>
  c.json({ error: { code: "not_implemented", message: "baas admin routes pending (Plan 3)", requestId: crypto.randomUUID() } }, 501)
);

export const baasRuntimeRoutes = new Hono().get("/_baas_runtime_stub", (c) =>
  c.json({ error: { code: "not_implemented", message: "baas runtime pending (Plan 3)", requestId: crypto.randomUUID() } }, 501)
);
