import { Hono } from "hono";
import type { Context } from "hono";
import { db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { assets, cards, shares } from "@defs";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { parseJson } from "../lib/json";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";

export const shareRoutes = new Hono<AppEnv>()
  .get("/shares/:token", async (c) => getPublicShare(c))
  .get("/share-assets/:key", async (c) => getPublicShareAsset(c))
  .get("/cards/:id/share", approvedUserOrAgentKey, async (c) => getCardShare(c))
  .post("/cards/:id/share", approvedUserOrAgentKey, async (c) => setCardShare(c));

async function getCardShare(c: Context<AppEnv>) {
  const card = await ownableCard(c);
  if (!card.ok) return card.response;
  const active = await activeSharesForCard(card.row.id);
  return c.json({
    publicAccess: active.length > 0,
    shareId: active[0]?.id ?? null,
  });
}

async function setCardShare(c: Context<AppEnv>) {
  const card = await ownableCard(c);
  if (!card.ok) return card.response;
  const body = await c.req.json().catch(() => ({}));
  const publicAccess = body?.publicAccess !== false;
  const now = Date.now();
  await revokeActiveShares(card.row.id, now);
  if (!publicAccess) return c.json({ publicAccess: false, shareId: null, url: null });

  const token = randomToken();
  const tokenHash = await hashShareToken(token);
  const id = newId("share");
  await db.insert(shares).values({
    id,
    cardId: card.row.id,
    scope: "public",
    targetUserId: null,
    tokenHash,
    createdBy: card.actingId,
    expiresAt: null,
    revokedAt: null,
    createdAt: now,
  });
  return c.json({ publicAccess: true, shareId: id, token, url: `${publicOrigin(c)}/share/${token}` }, 201);
}

async function getPublicShare(c: Context<AppEnv>) {
  const token = c.req.param("token");
  if (!token) return httpError(c, 404, "share_not_found", "Share link not found.");
  const tokenHash = await hashShareToken(token);
  const now = Date.now();
  const share = (await db.select().from(shares).where(eq(shares.tokenHash, tokenHash)))
    .find((row: any) => row.scope === "public" && !row.revokedAt && (!row.expiresAt || Number(row.expiresAt) > now));
  if (!share) return httpError(c, 404, "share_not_found", "Share link not found.");
  const [card] = await db.select().from(cards).where(eq(cards.id, share.cardId)).limit(1);
  if (!card || card.deletedAt) return httpError(c, 404, "share_not_found", "Share link not found.");
  if (typeof share.tokenHash !== "string") return httpError(c, 404, "share_not_found", "Share link not found.");
  return c.json({
    share: { publicAccess: true },
    card: await publicSharedCard(card, share.tokenHash, publicOrigin(c)),
  });
}

async function getPublicShareAsset(c: Context<AppEnv>) {
  const key = c.req.param("key");
  if (!key) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const parsedKey = parsePublicAssetKey(key);
  if (!parsedKey) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const share = await activeShareForAssetKey(parsedKey.index, key);
  if (!share) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const [card] = await db.select().from(cards).where(eq(cards.id, share.cardId)).limit(1);
  if (!card || card.deletedAt) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const layer = sharedLayerAt(card.cardSpecJson, parsedKey.index);
  const assetId = layer && typeof layer.assetId === "string" ? layer.assetId : null;
  if (!assetId) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset || asset.deletedAt || asset.status === "generating" || asset.status === "failed") return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const parsed = storage.tryParseS3Uri(asset.s3Uri);
  if (!parsed) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  const object = await storage.from(parsed.bucket).get(parsed.path);
  if (!object) return httpError(c, 404, "share_asset_not_found", "Share asset not found.");
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType || object.metadata.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function ownableCard(c: Context<AppEnv>): Promise<{ ok: true; row: any; actingId: string } | { ok: false; response: Response }> {
  const principal = c.get("principal");
  const userId = principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
  const actingId = principal.kind === "owner" ? principal.email ?? "owner" : userId;
  if (!actingId) return { ok: false, response: httpError(c, 401, "user_required", "User principal required.") };
  const cardId = c.req.param("id");
  if (!cardId) return { ok: false, response: httpError(c, 404, "not_found", "Card not found.") };
  const [row] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!row || row.deletedAt) return { ok: false, response: httpError(c, 404, "not_found", "Card not found.") };
  if (row.creatorUserId !== userId && principal.kind !== "owner") {
    return { ok: false, response: httpError(c, 403, "forbidden", "Only the card creator can share this card.") };
  }
  return { ok: true, row, actingId };
}

async function revokeActiveShares(cardId: string, now: number): Promise<void> {
  for (const share of await activeSharesForCard(cardId)) {
    await db.update(shares).set({ revokedAt: now }).where(eq(shares.id, share.id));
  }
}

async function activeSharesForCard(cardId: string): Promise<any[]> {
  const now = Date.now();
  return (await db.select().from(shares).where(eq(shares.cardId, cardId)))
    .filter((row: any) => row.cardId === cardId && row.scope === "public" && !row.revokedAt && (!row.expiresAt || Number(row.expiresAt) > now));
}

async function publicSharedCard(row: any, tokenHash: string, origin: string) {
  const cardSpec = await resolveSharedCardSpec(row.cardSpecJson, tokenHash, origin);
  return {
    title: row.title,
    name: row.title,
    ratioPreset: row.ratioPreset,
    width: row.width,
    height: row.height,
    background: backgroundFromSpec(cardSpec),
    cardSpec,
  };
}

async function resolveSharedCardSpec(raw: string | null | undefined, tokenHash: string, origin: string): Promise<Record<string, unknown>> {
  const spec = parseJson<Record<string, unknown>>(raw, {});
  const layers = Array.isArray(spec.layers)
    ? spec.layers
    : Array.isArray((spec.composition as { layers?: unknown } | undefined)?.layers)
      ? (spec.composition as { layers: unknown[] }).layers
      : null;
  if (!layers) return { layers: [], background: backgroundFromSpec(spec) };
  const resolved = await Promise.all(layers.map(async (layer, index) => {
    if (!layer || typeof layer !== "object") return null;
    const row = layer as Record<string, unknown>;
    const publicLayer = renderLayer(row);
    const assetId = typeof row.assetId === "string" ? row.assetId : null;
    if (!assetId) return publicLayer;
    const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!asset || asset.deletedAt || asset.status === "generating" || asset.status === "failed") return publicLayer;
    const src = storage.tryParseS3Uri(asset.s3Uri) ? `${origin}/api/public/share-assets/${await publicAssetKey(tokenHash, index)}` : null;
    return src ? { ...publicLayer, src } : publicLayer;
  }));
  return { layers: resolved.filter(Boolean), background: backgroundFromSpec(spec) };
}

function renderLayer(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  copyString(row, out, "kind");
  copyString(row, out, "name");
  copyString(row, out, "assetName");
  copyString(row, out, "textValue");
  copyString(row, out, "content");
  copyString(row, out, "font");
  copyString(row, out, "textAlign");
  copyString(row, out, "decoration");
  copyString(row, out, "decorationColor");
  copyString(row, out, "blendMode");
  copyString(row, out, "shadowColor");
  copyString(row, out, "strokeColor");
  copyString(row, out, "cropMode");
  copyString(row, out, "filter");
  copyString(row, out, "thumbBg");
  copyString(row, out, "thumbFg");
  const src = typeof row.src === "string" && row.src.startsWith("https://") ? row.src : null;
  if (src) out.src = src;
  copyNumber(row, out, "opacity");
  copyNumber(row, out, "x");
  copyNumber(row, out, "y");
  copyNumber(row, out, "width");
  copyNumber(row, out, "height");
  copyNumber(row, out, "rotation");
  copyNumber(row, out, "fontSize");
  copyNumber(row, out, "shadowBlur");
  copyNumber(row, out, "shadowOffsetX");
  copyNumber(row, out, "shadowOffsetY");
  copyNumber(row, out, "strokeWidth");
  copyNumber(row, out, "cornerRadius");
  copyBoolean(row, out, "visible");
  copyBoolean(row, out, "lockRatio");
  copyBoolean(row, out, "shadowEnabled");
  copyBoolean(row, out, "strokeEnabled");
  return out;
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "string") target[key] = source[key];
}

function copyNumber(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) target[key] = value;
}

function copyBoolean(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "boolean") target[key] = source[key];
}

function backgroundFromSpec(spec: Record<string, unknown>): string | null {
  const background = spec.background ?? (spec.canvas as Record<string, unknown> | undefined)?.background;
  if (typeof background === "string" && isHexColor(background)) return background;
  const layers = (spec.layers ?? (spec.composition as { layers?: unknown } | undefined)?.layers) as unknown;
  if (Array.isArray(layers)) {
    const bgLayer = layers.find((layer) => layer && typeof layer === "object" && (layer as Record<string, unknown>).kind === "bg") as Record<string, unknown> | undefined;
    const thumbBg = bgLayer?.thumbBg;
    if (typeof thumbBg === "string" && isHexColor(thumbBg)) return thumbBg;
  }
  const match = JSON.stringify(spec).match(/#[0-9a-fA-F]{6}/);
  return match?.[0] ?? null;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function parsePublicAssetKey(key: string): { index: number } | null {
  const match = key.match(/^([0-9]+)-([a-f0-9]{32})$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 ? { index } : null;
}

async function activeShareForAssetKey(layerIndex: number, key: string): Promise<any | null> {
  const now = Date.now();
  const active = (await db.select().from(shares))
    .filter((row: any) => row.scope === "public" && row.tokenHash && !row.revokedAt && (!row.expiresAt || Number(row.expiresAt) > now));
  for (const share of active) {
    const tokenHash = share.tokenHash;
    if (typeof tokenHash === "string" && await publicAssetKey(tokenHash, layerIndex) === key) return share;
  }
  return null;
}

function sharedLayerAt(raw: string | null | undefined, index: number): Record<string, unknown> | null {
  const spec = parseJson<Record<string, unknown>>(raw, {});
  const layers = Array.isArray(spec.layers)
    ? spec.layers
    : Array.isArray((spec.composition as { layers?: unknown } | undefined)?.layers)
      ? (spec.composition as { layers: unknown[] }).layers
      : [];
  const layer = layers[index];
  return layer && typeof layer === "object" ? layer as Record<string, unknown> : null;
}

async function publicAssetKey(tokenHash: string, layerIndex: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tokenHash}:${layerIndex}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${layerIndex}-${hex.slice(0, 32)}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicOrigin(c: Context): string {
  return new URL(c.req.url).origin;
}
