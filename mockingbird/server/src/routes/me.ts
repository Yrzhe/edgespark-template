import { Hono } from "hono";
import { auth } from "edgespark/http";
import { httpError } from "../lib/httpErrors";
import { isOwnerEmail, getMgmtSecret } from "../lib/ownerConfig";
import { signMgmtToken } from "../lib/mgmtToken";
import type { AppEnv } from "../middleware/managementAuth";

export const meRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
    if (isOwnerEmail(auth.user.email)) c.header("Set-Cookie", ownerCookie());
    return c.json({ email: auth.user.email });
  })
  .get("/token", async (c) => {
    if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
    const email = auth.user.email;
    if (!email || !isOwnerEmail(email)) return httpError(c, 403, "not_owner", "Only the owner can mint a management token.");
    c.header("Set-Cookie", ownerCookie());
    const mgmtSecret = getMgmtSecret();
    if (!mgmtSecret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    const token = await signMgmtToken({ email }, mgmtSecret, 900);
    return c.json({ token, expiresInSec: 900 });
  });

function ownerCookie(): string {
  return "mb_owner=1; Path=/; Max-Age=86400; SameSite=Lax; Secure";
}
