import { Hono } from "hono";
import { isAdSlot, recordAdBeacon, selectAdsForSlot, sha256Hex } from "../lib/ads";

export const adRoutes = new Hono()
  .get("/ads", async (c) => {
    const slot = c.req.query("slot");
    if (!slot || !isAdSlot(slot)) {
      return c.json({ error: "invalid_slot", message: "slot must be one of feed-inline, post-mid, sidebar, search." }, 400);
    }

    const ads = await selectAdsForSlot(slot, { now: Date.now() });
    return c.json({ ads });
  })
  .post("/ads/:id/impression", async (c) => {
    const result = await recordAdBeacon({
      adId: c.req.param("id"),
      eventType: "impression",
      ipHash: await requestIpHash(c.req.raw),
    });
    if (!result.ad) {
      return c.json({ error: "ad_not_found", message: "Ad not found." }, 404);
    }
    return new Response(null, { status: 204 });
  })
  .get("/ads/:id/click", async (c) => {
    const result = await recordAdBeacon({
      adId: c.req.param("id"),
      eventType: "click",
      ipHash: await requestIpHash(c.req.raw),
    });
    if (!result.ad) {
      return c.json({ error: "ad_not_found", message: "Ad not found." }, 404);
    }
    return c.redirect(result.ad.ctaUrl, 302);
  });

async function requestIpHash(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return sha256Hex(ip);
}
