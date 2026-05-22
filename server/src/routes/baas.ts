/**
 * BaaS LANE (Plan 3) — collection/rule admin + public BaaS runtime.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, count, eq } from "drizzle-orm";
import { baasCollections, baasFiles, baasRecords, buckets } from "../defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { MAX_UPLOAD_BYTES, makeUploadKey, sanitizeFilename } from "../lib/baas/files";
import {
  decodeRecordCursor,
  formatRecord,
  isJsonObject,
  listRecords,
  loadActiveSite,
  loadCollectionRules,
  parseLimit,
  stringifyRecordData,
} from "../lib/baas/records";
import { checkRecordRateLimit, getClientIp, hashIp } from "../lib/baas/rateLimit";
import { assertValidRules, canCreate, canModify, canRead, type ReadRule, type WriteRule } from "../lib/baas/rules";

type EdgeDb = typeof import("edgespark").db;
type BatchStatement = Parameters<EdgeDb["batch"]>[0][number];
type Failure = { ok: false; message: string };

export const baasManageRoutes = new Hono<AppEnv>()
  .get("/sites/:id/collections", async (c) => {
    c.get("principal");
    const { db } = await import("edgespark");
    if (!(await loadActiveSite(db, c.req.param("id")))) return httpError(c as never, 404, "site_not_found", "Site not found.");
    const collections = await db
      .select()
      .from(baasCollections)
      .where(eq(baasCollections.siteId, c.req.param("id")));
    return c.json({ collections: collections.map(formatCollection) });
  })
  .post("/sites/:id/collections", async (c) => {
    const body = await readJson(c);
    const parsed = parseCreateCollection(body);
    if (!parsed.ok) return httpError(c as never, 400, "invalid_request", parsed.message);

    const { db } = await import("edgespark");
    const site = await loadActiveSite(db, c.req.param("id"));
    if (!site) return httpError(c as never, 404, "site_not_found", "Site not found.");

    const now = Date.now();
    try {
      const [collection] = await db
        .insert(baasCollections)
        .values({ id: newId(), siteId: site.id, createdAt: now, ...parsed.value })
        .returning();
      return c.json({ collection: formatCollection(collection) }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return httpError(c as never, 409, "collection_conflict", "A collection with that name already exists.");
      }
      throw error;
    }
  })
  .patch("/sites/:id/collections/:name", async (c) => {
    const body = await readJson(c);
    const parsed = parsePatchCollection(body);
    if (!parsed.ok) return httpError(c as never, 400, "invalid_request", parsed.message);

    const { db } = await import("edgespark");
    if (!(await loadActiveSite(db, c.req.param("id")))) return httpError(c as never, 404, "site_not_found", "Site not found.");
    const [collection] = await db
      .update(baasCollections)
      .set(parsed.value)
      .where(and(eq(baasCollections.siteId, c.req.param("id")), eq(baasCollections.name, c.req.param("name"))))
      .returning();
    if (!collection) return httpError(c as never, 404, "collection_not_found", "Collection not found.");
    return c.json({ collection: formatCollection(collection) });
  })
  .delete("/sites/:id/collections/:name", async (c) => {
    const { db } = await import("edgespark");
    const siteId = c.req.param("id");
    const name = c.req.param("name");
    if (!(await loadActiveSite(db, siteId))) return httpError(c as never, 404, "site_not_found", "Site not found.");
    await runBatch(db, [
      db.delete(baasRecords).where(and(eq(baasRecords.siteId, siteId), eq(baasRecords.collection, name))),
      db.delete(baasCollections).where(and(eq(baasCollections.siteId, siteId), eq(baasCollections.name, name))),
    ]);
    return c.json({ deleted: true });
  })
  .get("/sites/:id/collections/:name/records", async (c) => {
    const { db } = await import("edgespark");
    const siteId = c.req.param("id");
    const name = c.req.param("name");
    if (!(await loadActiveSite(db, siteId))) return httpError(c as never, 404, "site_not_found", "Site not found.");
    if (!(await loadCollectionRules(db, siteId, name))) return httpError(c as never, 404, "collection_not_found", "Collection not found.");
    const page = await listRecords(db, siteId, name, decodeRecordCursor(c.req.query("cursor")), parseLimit(c.req.query("limit")));
    return c.json(page);
  })
  .delete("/sites/:id/collections/:name/records/:rid", async (c) => {
    const { db } = await import("edgespark");
    const siteId = c.req.param("id");
    const name = c.req.param("name");
    if (!(await loadActiveSite(db, siteId))) return httpError(c as never, 404, "site_not_found", "Site not found.");
    const [record] = await db
      .delete(baasRecords)
      .where(and(eq(baasRecords.siteId, siteId), eq(baasRecords.collection, name), eq(baasRecords.id, c.req.param("rid"))))
      .returning();
    if (!record) return httpError(c as never, 404, "record_not_found", "Record not found.");
    return c.json({ deleted: true });
  });

export const baasRuntimeRoutes = new Hono()
  .post("/:siteId/collections/:name/records", async (c) => {
    const { db } = await import("edgespark");
    const checked = await runtimeCollection(c, "write");
    if (!checked.ok) return checked.response;
    if (!canCreate(checked.collection.write)) return forbidden(c);

    const body = await readJson(c);
    const data = stringifyRecordData(body, checked.collection.maxBytes);
    if (!data.ok) {
      return isJsonObject(body)
        ? httpError(c as never, 413, "record_too_large", "Record is too large.")
        : httpError(c as never, 400, "invalid_request", "Request body must be a JSON object.");
    }

    if (checked.collection.maxRecords !== null) {
      const [row] = await db
        .select({ value: count() })
        .from(baasRecords)
        .where(and(eq(baasRecords.siteId, checked.site.id), eq(baasRecords.collection, checked.collection.name)));
      if ((row?.value ?? 0) >= checked.collection.maxRecords) {
        return httpError(c as never, 429, "collection_limit_exceeded", "Collection record limit exceeded.");
      }
    }

    const sourceIpHash = await hashIp(getClientIp(c.req.raw.headers));
    const rate = await checkRecordRateLimit(db, {
      siteId: checked.site.id,
      collection: checked.collection.name,
      sourceIpHash,
    });
    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retryAfter));
      return httpError(c as never, 429, "rate_limited", "Too many requests.");
    }

    const now = Date.now();
    const id = newId();
    await db.insert(baasRecords).values({
      id,
      siteId: checked.site.id,
      collection: checked.collection.name,
      data: data.json,
      sourceIpHash,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ id, createdAt: now }, 201);
  })
  .get("/:siteId/collections/:name/records", async (c) => {
    const { db } = await import("edgespark");
    const checked = await runtimeCollection(c, "read");
    if (!checked.ok) return checked.response;
    if (!canRead(checked.collection.read)) return forbidden(c);
    const page = await listRecords(
      db,
      checked.site.id,
      checked.collection.name,
      decodeRecordCursor(c.req.query("cursor")),
      parseLimit(c.req.query("limit"))
    );
    return c.json(page);
  })
  .get("/:siteId/collections/:name/records/:rid", async (c) => {
    const { db } = await import("edgespark");
    const checked = await runtimeCollection(c, "read");
    if (!checked.ok) return checked.response;
    if (!canRead(checked.collection.read)) return forbidden(c);
    const [record] = await db
      .select()
      .from(baasRecords)
      .where(and(eq(baasRecords.siteId, checked.site.id), eq(baasRecords.collection, checked.collection.name), eq(baasRecords.id, c.req.param("rid"))))
      .limit(1);
    if (!record) return forbidden(c);
    return c.json({ record: formatRecord(record) });
  })
  .put("/:siteId/collections/:name/records/:rid", async (c) => updateRuntimeRecord(c))
  .patch("/:siteId/collections/:name/records/:rid", async (c) => updateRuntimeRecord(c))
  .delete("/:siteId/collections/:name/records/:rid", async (c) => {
    const { db } = await import("edgespark");
    const checked = await runtimeCollection(c, "write");
    if (!checked.ok) return checked.response;
    if (!canModify(checked.collection.write)) return forbidden(c);
    await db
      .delete(baasRecords)
      .where(and(eq(baasRecords.siteId, checked.site.id), eq(baasRecords.collection, checked.collection.name), eq(baasRecords.id, c.req.param("rid"))));
    return c.json({ deleted: true });
  })
  .post("/:siteId/collections/:name/files", async (c) => {
    const { db, storage } = await import("edgespark");
    const checked = await runtimeCollection(c, "write");
    if (!checked.ok) return checked.response;
    if (!canCreate(checked.collection.write)) return forbidden(c);
    const body = await readJson(c);
    const parsed = parseCreateFile(body);
    if (!parsed.ok) return httpError(c as never, 400, "invalid_request", parsed.message);

    const fileId = newId();
    const filename = sanitizeFilename(parsed.value.filename);
    const r2Key = makeUploadKey(checked.site.id, fileId, filename);
    const now = Date.now();
    await db.insert(baasFiles).values({
      id: fileId,
      siteId: checked.site.id,
      collection: checked.collection.name,
      r2Key,
      filename,
      contentType: parsed.value.contentType,
      size: 0,
      uploadConfirmedAt: null,
      createdAt: now,
    });
    const presigned = await storage.from(buckets.baasUploads).createPresignedPutUrl(r2Key, 900, {
      contentType: parsed.value.contentType,
    });
    return c.json({ fileId, uploadUrl: presigned.uploadUrl, requiredHeaders: presigned.requiredHeaders }, 201);
  })
  .post("/:siteId/files/:fileId/confirm", async (c) => {
    const { db, storage } = await import("edgespark");
    const siteId = c.req.param("siteId");
    const site = await loadActiveSite(db, siteId);
    if (!site) return forbidden(c);
    const [file] = await db
      .select()
      .from(baasFiles)
      .where(and(eq(baasFiles.siteId, site.id), eq(baasFiles.id, c.req.param("fileId"))))
      .limit(1);
    if (!file) return forbidden(c);
    const bucket = storage.from(buckets.baasUploads);
    const meta = await bucket.head(file.r2Key);
    if (!meta) return httpError(c as never, 404, "upload_not_found", "Upload not found.");
    if (meta.size > MAX_UPLOAD_BYTES) {
      await bucket.delete(file.r2Key);
      return httpError(c as never, 413, "file_too_large", "File is too large.");
    }
    const [updated] = await db
      .update(baasFiles)
      .set({ size: meta.size, uploadConfirmedAt: Date.now() })
      .where(and(eq(baasFiles.siteId, site.id), eq(baasFiles.id, file.id)))
      .returning();
    return c.json({ file: formatFile(updated) });
  })
  .get("/:siteId/files/:fileId", async (c) => {
    const { db, storage } = await import("edgespark");
    const site = await loadActiveSite(db, c.req.param("siteId"));
    if (!site) return forbidden(c);
    const [file] = await db
      .select()
      .from(baasFiles)
      .where(and(eq(baasFiles.siteId, site.id), eq(baasFiles.id, c.req.param("fileId"))))
      .limit(1);
    if (!file || !file.collection) return forbidden(c);
    const collection = await loadCollectionRules(db, site.id, file.collection);
    if (!collection || !canRead(collection.read) || !file.uploadConfirmedAt) return forbidden(c);
    const { downloadUrl } = await storage.from(buckets.baasUploads).createPresignedGetUrl(file.r2Key, 300);
    return c.json({ downloadUrl });
  });

async function updateRuntimeRecord(c: Context) {
  const { db } = await import("edgespark");
  const checked = await runtimeCollection(c, "write");
  if (!checked.ok) return checked.response;
  if (!canModify(checked.collection.write)) return forbidden(c);
  const body = await readJson(c);
  const data = stringifyRecordData(body, checked.collection.maxBytes);
  if (!data.ok) {
    return isJsonObject(body)
      ? httpError(c as never, 413, "record_too_large", "Record is too large.")
      : httpError(c as never, 400, "invalid_request", "Request body must be a JSON object.");
  }
  const [record] = await db
    .update(baasRecords)
    .set({ data: data.json, updatedAt: Date.now() })
    .where(and(eq(baasRecords.siteId, checked.site.id), eq(baasRecords.collection, checked.collection.name), eq(baasRecords.id, paramRequired(c, "rid"))))
    .returning();
  if (!record) return forbidden(c);
  return c.json({ record: formatRecord(record) });
}

async function runtimeCollection(c: Context, _mode: "read" | "write") {
  const { db } = await import("edgespark");
  const site = await loadActiveSite(db, paramRequired(c, "siteId"));
  if (!site) return { ok: false as const, response: forbidden(c) };
  c.req.header("X-Site-Key"); // Public attribution only; never authorization.
  const collection = await loadCollectionRules(db, site.id, paramRequired(c, "name"));
  if (!collection) return { ok: false as const, response: forbidden(c) };
  return { ok: true as const, site, collection };
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function parseCreateCollection(body: unknown):
  | { ok: true; value: { name: string; read: ReadRule; write: WriteRule; maxRecords: number | null; maxBytes: number } }
  | Failure {
  if (!isJsonObject(body)) return fail("Request body must be a JSON object.");
  const fields = parseCollectionFields(body, true);
  if (!fields.ok) return fields;
  return { ok: true, value: fields.value as { name: string; read: ReadRule; write: WriteRule; maxRecords: number | null; maxBytes: number } };
}

function parsePatchCollection(body: unknown):
  | { ok: true; value: Partial<{ read: ReadRule; write: WriteRule; maxRecords: number | null; maxBytes: number }> }
  | Failure {
  if (!isJsonObject(body)) return fail("Request body must be a JSON object.");
  const fields = parseCollectionFields(body, false);
  if (!fields.ok) return fields;
  const { name, ...value } = fields.value;
  if (name !== undefined) return fail("Collection name cannot be changed.");
  if (Object.keys(value).length === 0) return fail("At least one editable field is required.");
  return { ok: true, value };
}

function parseCollectionFields(
  body: Record<string, unknown>,
  requireAll: boolean
):
  | { ok: true; value: Partial<{ name: string; read: ReadRule; write: WriteRule; maxRecords: number | null; maxBytes: number }> }
  | Failure {
  const value: Partial<{ name: string; read: ReadRule; write: WriteRule; maxRecords: number | null; maxBytes: number }> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.name)) {
      return fail("name must be 1-64 letters, numbers, underscores, or hyphens.");
    }
    value.name = body.name;
  } else if (requireAll) return fail("name is required.");

  if (body.read !== undefined || body.write !== undefined) {
    try {
      const rules = assertValidRules({ read: body.read, write: body.write });
      value.read = rules.read;
      value.write = rules.write;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Invalid rules.");
    }
  } else if (requireAll) return fail("read and write are required.");

  if (body.maxRecords !== undefined) {
    const maxRecords = body.maxRecords;
    if (maxRecords !== null && (typeof maxRecords !== "number" || !Number.isInteger(maxRecords) || maxRecords < 1)) {
      return fail("maxRecords must be a positive integer or null.");
    }
    value.maxRecords = maxRecords;
  } else if (requireAll) value.maxRecords = null;

  if (body.maxBytes !== undefined) {
    const maxBytes = body.maxBytes;
    if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536) {
      return fail("maxBytes must be an integer from 1 to 65536.");
    }
    value.maxBytes = maxBytes;
  } else if (requireAll) value.maxBytes = 10240;

  return { ok: true, value };
}

function parseCreateFile(body: unknown): { ok: true; value: { filename: string; contentType: string } } | Failure {
  if (!isJsonObject(body)) return fail("Request body must be a JSON object.");
  if (typeof body.filename !== "string" || body.filename.trim().length === 0) return fail("filename is required.");
  if (typeof body.contentType !== "string" || body.contentType.trim().length === 0 || body.contentType.length > 120) {
    return fail("contentType is required.");
  }
  return { ok: true, value: { filename: body.filename, contentType: body.contentType.trim() } };
}

function formatCollection(row: typeof baasCollections.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    read: row.read,
    write: row.write,
    maxRecords: row.maxRecords,
    maxBytes: row.maxBytes,
    createdAt: row.createdAt,
  };
}

function formatFile(row: typeof baasFiles.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    collection: row.collection,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    uploadConfirmedAt: row.uploadConfirmedAt,
    createdAt: row.createdAt,
  };
}

function fail(message: string): Failure {
  return { ok: false, message };
}

function forbidden(c: Context) {
  return httpError(c as never, 403, "forbidden", "Forbidden.");
}

function paramRequired(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new Error(`missing-route-param:${name}`);
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}

async function runBatch(db: EdgeDb, statements: BatchStatement[]): Promise<void> {
  const batch = statements.filter(Boolean);
  if (batch.length > 0) await db.batch(batch as [BatchStatement, ...BatchStatement[]]);
}
