import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import { buckets, images, imageUploadIntents } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isImageKind, isSupportedImageType, MAX_IMAGE_BYTES, sanitizeFilename } from "../lib/assets";

export const imagesManageRoutes = new Hono<AppEnv>()
  .get("/images", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(images).where(isNull(images.deletedAt)).orderBy(asc(images.createdAt));
    return c.json({ images: rows });
  })
  .post("/images/presign", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || !isImageKind(body.kind) || typeof body.filename !== "string" || !isSupportedImageType(body.contentType)) return httpError(c, 400, "invalid_request", "kind, filename, and supported contentType are required.");
    const imageId = newId();
    const assetId = newId();
    const key = `images/${imageId}/${assetId}/${sanitizeFilename(body.filename)}`;
    const { db, storage } = await import("edgespark");
    const now = Date.now();
    await db.insert(imageUploadIntents).values({ id: newId(), imageId, assetId, kind: body.kind, key, contentType: body.contentType, expiresAt: now + 900_000, confirmedAt: null, createdAt: now });
    const presigned = await storage.from(buckets.mockingbirdMedia).createPresignedPutUrl(key, 900, { contentType: body.contentType });
    return c.json({ imageId, assetId, key, uploadUrl: presigned.uploadUrl, requiredHeaders: presigned.requiredHeaders }, 201);
  })
  .post("/images/confirm", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.imageId !== "string" || typeof body.assetId !== "string" || !isUuid(body.imageId) || !isUuid(body.assetId) || !isImageKind(body.kind)) return httpError(c, 400, "invalid_request", "UUID imageId, UUID assetId, and kind are required.");
    const prefix = `images/${body.imageId}/${body.assetId}/`;
    const { db, storage } = await import("edgespark");
    const [intent] = await db.select().from(imageUploadIntents).where(and(eq(imageUploadIntents.imageId, body.imageId), eq(imageUploadIntents.assetId, body.assetId), isNull(imageUploadIntents.confirmedAt))).limit(1);
    if (!intent || intent.expiresAt < Date.now() || intent.kind !== body.kind || intent.key !== prefix + intent.key.split("/").pop()) return httpError(c, 404, "upload_intent_not_found", "Upload intent not found or expired.");
    const bucket = storage.from(buckets.mockingbirdMedia);
    const listed = await bucket.list({ prefix, limit: 2 });
    const file = listed.files[0];
    if (!file) return httpError(c, 404, "upload_not_found", "Upload not found.");
    if (listed.files.length > 1) return httpError(c, 400, "ambiguous_upload", "Only one uploaded file is allowed per asset.");
    const meta = await bucket.head(file.path);
    if (!meta) return httpError(c, 404, "upload_not_found", "Upload not found.");
    if (!meta.contentType || !isSupportedImageType(meta.contentType) || meta.contentType !== intent.contentType) { await bucket.delete(file.path); return httpError(c, 415, "invalid_content_type", "Uploaded file type is not supported."); }
    if (meta.size > MAX_IMAGE_BYTES) { await bucket.delete(file.path); return httpError(c, 413, "file_too_large", "File is too large."); }
    const now = Date.now();
    const [row] = await db.insert(images).values({ id: body.imageId, kind: body.kind, alt: typeof body.alt === "string" ? body.alt.slice(0, 240) : "", s3Uri: storage.createS3Uri(buckets.mockingbirdMedia, file.path), contentType: meta.contentType, byteSize: meta.size, width: numberOrNull(body.width), height: numberOrNull(body.height), blurhash: typeof body.blurhash === "string" ? body.blurhash : null, tagsJson: body.tags ? JSON.stringify(body.tags) : "[]", isActive: 1, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now }).returning();
    await db.update(imageUploadIntents).set({ confirmedAt: now }).where(eq(imageUploadIntents.id, intent.id));
    return c.json({ image: row }, 201);
  })
  .patch("/images/:id", async (c) => {
    const body = await readJson(c);
    const { db } = await import("edgespark");
    const [cur] = await db.select().from(images).where(and(eq(images.id, c.req.param("id")), isNull(images.deletedAt))).limit(1);
    if (!cur) return httpError(c, 404, "image_not_found", "Image not found.");
    if (!isRecord(body) || body.lockVersion !== cur.lockVersion) return httpError(c, 409, "lock_conflict", "Image changed; reload before editing.");
    const patch: Record<string, any> = { lockVersion: cur.lockVersion + 1, updatedAt: Date.now() };
    if (body.alt !== undefined) patch.alt = String(body.alt).slice(0, 240);
    if (body.kind !== undefined && isImageKind(body.kind)) patch.kind = body.kind;
    if (body.tags !== undefined) patch.tagsJson = JSON.stringify(body.tags);
    if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
    const [row] = await db.update(images).set(patch).where(and(eq(images.id, cur.id), eq(images.lockVersion, cur.lockVersion))).returning();
    return c.json({ image: row });
  })
  .delete("/images/:id", async (c) => {
    const { db } = await import("edgespark");
    await db.update(images).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(eq(images.id, c.req.param("id")));
    return c.json({ deleted: true });
  });

async function readJson(c: any): Promise<unknown> { try { return await c.req.json(); } catch { return null; } }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function numberOrNull(value: unknown): number | null { return Number.isSafeInteger(value) ? Number(value) : null; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
