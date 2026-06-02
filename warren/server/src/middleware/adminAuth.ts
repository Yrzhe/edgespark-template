import type { Context, MiddlewareHandler } from "hono";
import { ctx, secret } from "edgespark";
import { constantTimeEqualSha256 } from "../lib/keys";

export type AdminPrincipal = { kind: "admin" };
export type AgentPrincipal = { kind: "agent"; id: string; handle: string; status: string };
export type AppEnv = {
  Variables: {
    principal: AdminPrincipal | AgentPrincipal;
    agent: import("./agentAuth").AgentRow;
  };
};

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await requireAdmin(c);
  if (result instanceof Response) return result;
  await next();
};

export async function requireAdmin(c: Context<AppEnv>): Promise<true | Response> {
  const configured = secret.get("ADMIN_TOKEN") ?? ((ctx.environment as string) === "dev" ? "dev-admin-token" : null);
  if (!configured) {
    return c.json({ error: "not_configured", message: "ADMIN_TOKEN is not set." }, 500);
  }

  const actual = c.req.header("X-Admin-Token") ?? "";
  if (!actual || !(await constantTimeEqualSha256(actual, configured))) {
    return c.json({ error: "unauthorized", message: "Valid X-Admin-Token required." }, 401);
  }

  c.set("principal", { kind: "admin" });
  return true;
}
