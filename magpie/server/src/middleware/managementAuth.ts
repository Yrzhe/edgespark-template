import type { Context, MiddlewareHandler, Next } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { apiKeys, teamProfiles } from "@defs";
import { logEvent } from "../lib/events";
import { hashKey } from "../lib/keys";
import { verifyMgmtToken } from "../lib/mgmtToken";
import { getMgmtSecret, isOwnerEmail } from "../lib/ownerConfig";
import { httpError } from "../lib/httpErrors";

export type Principal =
  | { kind: "owner"; email?: string }
  | { kind: "agent"; keyId: string; userId: string }
  | { kind: "user"; userId: string; email: string; role: string };
export type AppEnv = { Variables: { principal: Principal } };

export const ownerSessionOrOwnerToken: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const bearer = bearerToken(c);
  if (bearer) {
    const secret = getMgmtSecret();
    if (!secret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    const tok = await verifyMgmtToken(bearer, secret);
    if (tok.ok && isOwnerEmail(tok.payload.email)) {
      c.set("principal", { kind: "owner", email: tok.payload.email });
      return next();
    }
    return httpError(c, 401, "invalid_credentials", "Invalid owner token.");
  }

  if (isOwnerEmail(auth.user?.email ?? null)) {
    c.set("principal", { kind: "owner", email: auth.user?.email ?? undefined });
    return next();
  }
  if (auth.user?.id) {
    const [profile] = await db.select().from(teamProfiles).where(eq(teamProfiles.userId, auth.user.id)).limit(1);
    if (profile?.role === "owner" && profile.approvalStatus === "approved") {
      c.set("principal", { kind: "owner", email: auth.user.email ?? undefined });
      return next();
    }
  }
  return httpError(c, 401, "owner_required", "Owner authentication required.");
};

export const approvedUserOrAgentKey: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const bearer = bearerToken(c);
  if (bearer) {
    const ownerSecret = getMgmtSecret();
    if (ownerSecret) {
      const tok = await verifyMgmtToken(bearer, ownerSecret);
      if (tok.ok && isOwnerEmail(tok.payload.email)) {
        c.set("principal", { kind: "owner", email: tok.payload.email });
        return next();
      }
    }
    const kh = await hashKey(bearer);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, kh)).limit(1);
    if (row && !row.revokedAt) {
      updateKeyLastUsed(row.id);
      c.set("principal", { kind: "agent", keyId: row.id, userId: row.createdBy });
      return next();
    }
    return httpError(c, 401, "invalid_credentials", "Invalid agent API key.");
  }
  return requireApprovedUser(c, next);
};

export const requireApprovedUser: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const sessionUser = auth.user;
  if (!sessionUser?.id || !sessionUser.email) return authDenied(c, 401, "unauthorized", "Authentication required.");
  if (isOwnerEmail(sessionUser.email)) {
    c.set("principal", { kind: "user", userId: sessionUser.id, email: sessionUser.email, role: "owner" });
    return next();
  }
  const [profile] = await db.select().from(teamProfiles).where(eq(teamProfiles.userId, sessionUser.id)).limit(1);
  if (!profile) return authDenied(c, 403, "pending_approval", "Owner approval is required.", sessionUser.id);
  if (profile.approvalStatus !== "approved") {
    const code = profile.approvalStatus === "rejected" ? "rejected" : profile.approvalStatus === "suspended" ? "suspended" : "pending_approval";
    return authDenied(c, 403, code, profile.rejectionReason ?? "Owner approval is required.", sessionUser.id);
  }
  c.set("principal", { kind: "user", userId: sessionUser.id, email: sessionUser.email, role: profile.role });
  return next();
};

export const managementAuth = ownerSessionOrOwnerToken;

function bearerToken(c: Context): string | null {
  const authz = c.req.header("Authorization");
  return authz?.startsWith("Bearer ") ? authz.slice(7) : null;
}

function authDenied(c: Context<AppEnv>, status: 401 | 403, code: string, message: string, userId?: string): Response {
  void logEvent("audit", "auth_denied", code, { userId, route: c.req.path });
  return httpError(c, status, code, message);
}

function updateKeyLastUsed(keyId: string): void {
  void (async () => {
    try {
      await db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, keyId));
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", code: "api_key_last_used_update_failed", error: String(error) }));
    }
  })();
}
