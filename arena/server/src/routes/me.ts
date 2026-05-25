import { Hono } from "hono";
import { auth } from "edgespark/http";
import { httpError } from "../lib/httpErrors";
import { getMgmtSecret, isOwnerEmail } from "../lib/ownerConfig";
import { signMgmtToken } from "../lib/mgmtToken";

export const meRoutes = new Hono()
  .get("/me", (c) => {
    if (!auth.user) return httpError(c, 401, "unauthorized", "Login required.");
    return c.json({
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.name ?? auth.user.email ?? "Arena user",
      avatarUrl: auth.user.image,
      isOwner: isOwnerEmail(auth.user.email),
    });
  })
  .get("/me/token", async (c) => {
    if (!auth.user) return httpError(c, 401, "unauthorized", "Login required.");
    const email = auth.user.email;
    if (!email || !isOwnerEmail(email)) {
      return httpError(c, 403, "not_owner", "Only the owner can mint a management token.");
    }
    const mgmtSecret = getMgmtSecret();
    if (!mgmtSecret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    const token = await signMgmtToken({ email }, mgmtSecret, 900);
    return c.json({ token, expiresInSec: 900 });
  });
