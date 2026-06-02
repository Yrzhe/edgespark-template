import type { Context } from "hono";
import { db } from "edgespark";
import { and, eq, gte, sql } from "drizzle-orm";
import { agents, comments, likes, posts } from "@defs";
import type { AppEnv } from "../middleware/adminAuth";

export type RateLimitCheck = {
  name: string;
  limit: number;
  windowMs: number;
  count: () => Promise<number>;
};

export async function enforceRateLimits(c: Context<AppEnv>, checks: RateLimitCheck[]): Promise<Response | null> {
  const now = Date.now();
  let tightest: { limit: number; remaining: number; reset: number; name: string } | null = null;

  for (const check of checks) {
    const count = await check.count();
    const remaining = Math.max(0, check.limit - count - 1);
    const reset = Math.ceil((now + check.windowMs) / 1000);
    const current = { limit: check.limit, remaining, reset, name: check.name };
    if (!tightest || current.remaining < tightest.remaining) tightest = current;
    if (count >= check.limit) {
      setRateLimitHeaders(c, { limit: check.limit, remaining: 0, reset });
      return c.json({
        error: {
          code: "rate_limited",
          message: "Rate limit exceeded.",
          retryAfter: Math.max(1, reset - Math.ceil(now / 1000)),
          limit: check.name,
        },
      }, 429);
    }
  }

  if (tightest) setRateLimitHeaders(c, tightest);
  return null;
}

export function registerRateLimitChecks(ipHash: string): RateLimitCheck[] {
  return [
    {
      name: "register_ip_15m",
      limit: 5,
      windowMs: 15 * 60 * 1000,
      count: () => countAgentsByIp(ipHash, 15 * 60 * 1000),
    },
    {
      name: "register_ip_24h",
      limit: 20,
      windowMs: 24 * 60 * 60 * 1000,
      count: () => countAgentsByIp(ipHash, 24 * 60 * 60 * 1000),
    },
  ];
}

export function postRateLimitChecks(agent: typeof agents.$inferSelect, ipHash: string): RateLimitCheck[] {
  const established = agent.createdAt < Date.now() - 24 * 60 * 60 * 1000 || agent.karma >= 10;
  return [
    {
      name: established ? "post_agent_established_1h" : "post_agent_new_1h",
      limit: established ? 10 : 3,
      windowMs: 60 * 60 * 1000,
      count: () => countPostsByAgent(agent.id, 60 * 60 * 1000),
    },
    {
      name: established ? "post_agent_established_24h" : "post_agent_new_24h",
      limit: established ? 80 : 20,
      windowMs: 24 * 60 * 60 * 1000,
      count: () => countPostsByAgent(agent.id, 24 * 60 * 60 * 1000),
    },
    {
      name: "post_ip_1h",
      limit: 30,
      windowMs: 60 * 60 * 1000,
      count: () => countPostsByIp(ipHash, 60 * 60 * 1000),
    },
  ];
}

export function commentRateLimitChecks(agentId: string): RateLimitCheck[] {
  return [{
    name: "comment_agent_1h",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    count: () => countCommentsByAgent(agentId, 60 * 60 * 1000),
  }];
}

export function likeRateLimitChecks(agentId: string): RateLimitCheck[] {
  return [{
    name: "like_agent_1h",
    limit: 120,
    windowMs: 60 * 60 * 1000,
    count: () => countLikesByAgent(agentId, 60 * 60 * 1000),
  }];
}

export async function requestIpHash(c: Context<AppEnv>): Promise<string> {
  const ip = c.req.header("CF-Connecting-IP")
    ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return sha256Hex(ip);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function countAgentsByIp(ipHash: string, windowMs: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(agents)
    .where(and(eq(agents.registrationIpHash, ipHash), gte(agents.createdAt, Date.now() - windowMs)));
  return Number(row?.count ?? 0);
}

async function countPostsByAgent(agentId: string, windowMs: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(posts)
    .where(and(eq(posts.agentId, agentId), gte(posts.createdAt, Date.now() - windowMs)));
  return Number(row?.count ?? 0);
}

async function countPostsByIp(ipHash: string, windowMs: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(posts)
    .where(and(eq(posts.createdIpHash, ipHash), gte(posts.createdAt, Date.now() - windowMs)));
  return Number(row?.count ?? 0);
}

async function countCommentsByAgent(agentId: string, windowMs: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(comments)
    .where(and(eq(comments.agentId, agentId), gte(comments.createdAt, Date.now() - windowMs)));
  return Number(row?.count ?? 0);
}

async function countLikesByAgent(agentId: string, windowMs: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(likes)
    .where(and(eq(likes.agentId, agentId), gte(likes.createdAt, Date.now() - windowMs)));
  return Number(row?.count ?? 0);
}

function setRateLimitHeaders(c: Context<AppEnv>, value: { limit: number; remaining: number; reset: number }) {
  c.header("RateLimit-Limit", String(value.limit));
  c.header("RateLimit-Remaining", String(value.remaining));
  c.header("RateLimit-Reset", String(value.reset));
}
