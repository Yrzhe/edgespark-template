import type { Context, MiddlewareHandler, Next } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { apiKeys } from "@defs";
import { hashKey } from "../lib/keys";
import { verifyMgmtToken } from "../lib/mgmtToken";
import { isOwnerEmail, getMgmtSecret } from "../lib/ownerConfig";
import { httpError } from "../lib/httpErrors";

export type Principal = { kind: "owner" } | { kind: "agent"; keyId: string };
export type AppEnv = { Variables: { principal: Principal } };

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const managementAuth: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const authz = c.req.header("Authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const mutating = MUTATIONS.has(c.req.method);

  if (bearer) {
    const mgmtSecret = getMgmtSecret();
    if (mutating && !mgmtSecret) {
      return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    }
    const tok = await verifyMgmtToken(bearer, mgmtSecret);
    if (tok.ok && isOwnerEmail(tok.payload.email)) {
      c.set("principal", { kind: "owner" });
      return next();
    }
    const kh = await hashKey(bearer);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, kh)).limit(1);
    if (row && !row.revokedAt) {
      updateKeyLastUsed(row.id);
      c.set("principal", { kind: "agent", keyId: row.id });
      return next();
    }
    return httpError(c, 401, "invalid_credentials", "Invalid bearer token.");
  }

  const isOwnerSession = isOwnerEmail(auth.user?.email ?? null);
  if (isOwnerSession && !mutating) {
    c.set("principal", { kind: "owner" });
    return next();
  }
  if (isOwnerSession && mutating) {
    return httpError(c, 401, "bearer_required", "Mutations require an Authorization: Bearer token (cookie-only is rejected).");
  }
  return httpError(c, 401, "unauthorized", "Authentication required.");
};

function updateKeyLastUsed(keyId: string): void {
  void (async () => {
    try {
      await db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, keyId));
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", code: "api_key_last_used_update_failed", error: String(error) }));
    }
  })();
}
