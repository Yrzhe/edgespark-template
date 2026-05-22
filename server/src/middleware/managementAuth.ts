/**
 * Management API gate for `/api/public/manage/*`.
 *
 * - READS (GET): owner session (auth.user.email === OWNER_EMAIL) OR a valid bearer.
 * - MUTATIONS (POST/PUT/PATCH/DELETE): a valid bearer is REQUIRED; cookie-only is rejected.
 *   This blunts same-origin escalation from hosted-site JS that rides the session cookie.
 *
 * A bearer is either the owner's short-lived management token (HMAC) or an agent API key.
 * Routes downstream read `c.get("principal")` and must still derive siteId from path + DB,
 * never from request bodies.
 */
import type { Context, MiddlewareHandler, Next } from "hono";
import { db, vars, secret } from "edgespark";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { apiKeys } from "@defs";
import { hashKey } from "../lib/keys";
import { verifyMgmtToken } from "../lib/mgmtToken";
import { httpError } from "../lib/httpErrors";

export type Principal = { kind: "owner" } | { kind: "agent"; keyId: string };
export type AppEnv = { Variables: { principal: Principal } };

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const managementAuth: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next: Next) => {
  const authz = c.req.header("Authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const mutating = MUTATIONS.has(c.req.method);
  const ownerEmail = vars.get("OWNER_EMAIL");

  if (bearer) {
    // 1a) owner management token
    const mgmtSecret = secret.get("MGMT_TOKEN_SECRET") ?? "";
    const tok = await verifyMgmtToken(bearer, mgmtSecret);
    if (tok.ok && ownerEmail && tok.payload.email === ownerEmail) {
      c.set("principal", { kind: "owner" });
      return next();
    }
    // 1b) agent API key
    const kh = await hashKey(bearer);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, kh)).limit(1);
    if (row && !row.revokedAt) {
      c.set("principal", { kind: "agent", keyId: row.id });
      return next();
    }
    return httpError(c, 401, "invalid_credentials", "Invalid bearer token.");
  }

  // 2) No bearer: only the owner SESSION, and only for READS.
  const sessionEmail = auth.user?.email ?? null;
  const isOwnerSession = !!ownerEmail && sessionEmail === ownerEmail;
  if (isOwnerSession && !mutating) {
    c.set("principal", { kind: "owner" });
    return next();
  }
  if (isOwnerSession && mutating) {
    return httpError(
      c,
      401,
      "bearer_required",
      "Mutations require an Authorization: Bearer token (cookie-only is rejected)."
    );
  }
  return httpError(c, 401, "unauthorized", "Authentication required.");
};
