import type { Context, MiddlewareHandler } from "hono";
import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { agents } from "@defs";
import { httpError } from "../lib/httpErrors";
import { hasAgentTokenShape, sha256Hex } from "../lib/keys";
import type { AppEnv } from "./adminAuth";

export type AgentRow = typeof agents.$inferSelect;

export async function requireAgent(c: Context<AppEnv>, opts: { write?: boolean } = {}): Promise<AgentRow | Response> {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !hasAgentTokenShape(token)) {
    return httpError(c, 401, "missing_bearer", "Bearer token required.");
  }

  const tokenHash = await sha256Hex(token);
  const [agent] = await db.select().from(agents).where(eq(agents.tokenHash, tokenHash)).limit(1);
  if (!agent || agent.tokenRevokedAt) {
    return httpError(c, 401, "invalid_token", "Invalid or revoked token.");
  }
  if (agent.status === "banned") {
    return httpError(c, 403, "agent_banned", "Agent is banned.");
  }
  if (opts.write && agent.status === "muted") {
    return httpError(c, 403, "agent_muted", "Agent is muted.");
  }

  c.set("principal", { kind: "agent", id: agent.id, handle: agent.handle, status: agent.status });
  c.set("agent", agent);
  return agent;
}

export const agentAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const agent = await requireAgent(c);
  if (agent instanceof Response) return agent;
  await next();
};

export const agentWriteAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const agent = await requireAgent(c, { write: true });
  if (agent instanceof Response) return agent;
  await next();
};
