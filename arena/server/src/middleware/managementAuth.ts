import type { Context, MiddlewareHandler, Next } from "hono";
import { db } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { apiKeys } from "@defs";
import { httpError } from "../lib/httpErrors";
import { hashKey } from "../lib/keys";
import { getMgmtSecret, isOwnerEmail } from "../lib/ownerConfig";
import { verifyMgmtToken } from "../lib/mgmtToken";

export type Principal = { kind: "owner" } | { kind: "agent"; keyId: string };
export type AppEnv = { Variables: { principal: Principal } };

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const managementAuth: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const authz = c.req.header("Authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const mutating = MUTATIONS.has(c.req.method);

  if (bearer) {
    const tok = await verifyMgmtToken(bearer, getMgmtSecret());
    if (tok.ok && isOwnerEmail(tok.payload.email)) {
      c.set("principal", { kind: "owner" });
      return next();
    }
    const keyHash = await hashKey(bearer);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    if (row && !row.revokedAt) {
      void db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, row.id));
      c.set("principal", { kind: "agent", keyId: row.id });
      return next();
    }
    return httpError(c, 401, "invalid_credentials", "Invalid bearer token.");
  }

  const ownerSession = isOwnerEmail(auth.user?.email ?? null);
  if (ownerSession && !mutating) {
    c.set("principal", { kind: "owner" });
    return next();
  }
  if (ownerSession) {
    return httpError(c, 401, "bearer_required", "Mutations require an Authorization: Bearer token.");
  }
  return httpError(c, 401, "unauthorized", "Authentication required.");
};

