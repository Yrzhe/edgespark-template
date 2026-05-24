import { Hono } from "hono";
import type { Context } from "hono";
import { auth } from "edgespark/http";
import { eq } from "drizzle-orm";
import { buckets, ownerSettings } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isOwnerEmail } from "../lib/ownerConfig";

const OWNER_SETTINGS_ID = "owner";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const meRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
    const avatarUrl = await ownerAvatarUrl();
    return c.json({ email: auth.user.email, avatarUrl });
  })
  .get("/token", async (c) => {
    if (!auth.isAuthenticated()) return httpError(c, 401, "unauthorized", "Login required.");
    const email = auth.user.email;
    if (!email || !isOwnerEmail(email)) {
      return httpError(c, 403, "not_owner", "Only the owner can mint a management token.");
    }
    const { getMgmtSecret } = await import("../lib/ownerConfig");
    const mgmtSecret = getMgmtSecret();
    if (!mgmtSecret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    const { signMgmtToken } = await import("../lib/mgmtToken");
    const token = await signMgmtToken({ email }, mgmtSecret, 900);
    return c.json({ token, expiresInSec: 900 });
  })
  .post("/avatar/presign", async (c) => {
    const owner = requireOwner();
    if (!owner.ok) return httpError(c, owner.status, owner.code, owner.message);
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.contentType !== "string" || !IMAGE_TYPES.has(body.contentType)) {
      return httpError(c, 400, "invalid_request", "contentType must be a supported image type.");
    }
    const assetId = newId();
    const key = `owner/avatar/${assetId}/avatar.${EXT_BY_TYPE[body.contentType]}`;
    const { storage } = await import("edgespark");
    const presigned = await storage.from(buckets.perchMedia).createPresignedPutUrl(key, 900, { contentType: body.contentType });
    return c.json({ uploadUrl: presigned.uploadUrl, requiredHeaders: presigned.requiredHeaders, key }, 201);
  })
  .post("/avatar/confirm", async (c) => {
    const owner = requireOwner();
    if (!owner.ok) return httpError(c, owner.status, owner.code, owner.message);
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.key !== "string" || !isOwnerAvatarKey(body.key)) {
      return httpError(c, 400, "invalid_request", "key is invalid.");
    }
    const { storage, db } = await import("edgespark");
    const bucket = storage.from(buckets.perchMedia);
    const meta = await bucket.head(body.key);
    if (!meta) return httpError(c, 404, "upload_not_found", "Upload not found.");
    if (!meta.contentType || !IMAGE_TYPES.has(meta.contentType)) {
      await bucket.delete(body.key);
      return httpError(c, 415, "invalid_content_type", "Uploaded file type is not supported.");
    }
    if (meta.size >= MAX_AVATAR_BYTES) {
      await bucket.delete(body.key);
      return httpError(c, 413, "file_too_large", "File is too large.");
    }
    const avatarS3Uri = storage.createS3Uri(buckets.perchMedia, body.key);
    const now = Date.now();
    const updated = await db.update(ownerSettings)
      .set({ avatarS3Uri, updatedAt: now })
      .where(eq(ownerSettings.id, OWNER_SETTINGS_ID))
      .returning({ id: ownerSettings.id });
    if (updated.length === 0) {
      await db.insert(ownerSettings).values({ id: OWNER_SETTINGS_ID, avatarS3Uri, updatedAt: now }).returning({ id: ownerSettings.id });
    }
    return c.json({ avatarS3Uri });
  });

async function ownerAvatarUrl(): Promise<string | null> {
  const { db, storage } = await import("edgespark");
  const row = (await db.select({ avatarS3Uri: ownerSettings.avatarS3Uri })
    .from(ownerSettings)
    .where(eq(ownerSettings.id, OWNER_SETTINGS_ID))
    .limit(1))[0];
  if (!row?.avatarS3Uri) return null;
  const parsed = storage.tryParseS3Uri(row.avatarS3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.perchMedia.bucket_name) return null;
  const { downloadUrl } = await storage.from(buckets.perchMedia).createPresignedGetUrl(parsed.path, 900);
  return downloadUrl;
}

function requireOwner():
  | { ok: true }
  | { ok: false; status: 401 | 403; code: string; message: string } {
  if (!auth.isAuthenticated()) return { ok: false, status: 401, code: "unauthorized", message: "Login required." };
  const email = auth.user.email;
  if (!email || !isOwnerEmail(email)) return { ok: false, status: 403, code: "not_owner", message: "Only the owner can manage the account avatar." };
  return { ok: true };
}

async function readJson(c: Context): Promise<unknown> {
  try { return await c.req.json(); } catch { return null; }
}

function isOwnerAvatarKey(value: string): boolean {
  return /^owner\/avatar\/[0-9a-f-]{36}\/avatar\.(?:jpg|png|webp|gif)$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
