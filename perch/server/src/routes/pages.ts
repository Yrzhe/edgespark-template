import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { apiKeys, links, pages } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { generateApiKey } from "../lib/keys";
import { normalizeSocialLinks } from "../lib/publicPage/html";
const MAX_JSON_BYTES = 4096;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const pagesManageRoutes = new Hono<AppEnv>()
  .get("/keys", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select({
      id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt,
    }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
    return c.json({ keys: rows });
  })
  .post("/keys", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0 || body.name.trim().length > 80) {
      return httpError(c, 400, "invalid_request", "name must be a non-empty string up to 80 characters.");
    }
    const { db } = await import("edgespark");
    const key = await generateApiKey();
    const now = Date.now();
    const [row] = await db.insert(apiKeys).values({
      id: newId(), name: body.name.trim(), keyHash: key.hash, prefix: key.prefix,
      createdAt: now, lastUsedAt: null, revokedAt: null,
    }).returning({
      id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt,
    });
    return c.json({ key: row, plaintext: key.plaintext }, 201);
  })
  .delete("/keys/:id", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db.update(apiKeys).set({ revokedAt: Date.now() })
      .where(and(eq(apiKeys.id, c.req.param("id")), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    if (!row) return httpError(c, 404, "key_not_found", "API key not found.");
    return c.json({ revoked: true });
  })
  .get("/pages", async (c) => {
    const { db } = await import("edgespark");
    const { limit, offset } = parsePage(c.req.query("limit"), c.req.query("offset"));
    const sortColumn = PAGE_SORT[c.req.query("sort") ?? ""] ?? pages.updatedAt;
    const direction = c.req.query("order") === "asc" ? asc : desc;
    const [{ value: total } = { value: 0 }] = await db.select({ value: count() }).from(pages).where(isNull(pages.deletedAt));
    const rows = await db.select().from(pages).where(isNull(pages.deletedAt))
      .orderBy(direction(sortColumn), direction(pages.id)).limit(limit).offset(offset);
    return c.json({ pages: rows.map(formatPage), total, limit, offset });
  })
  .post("/pages", async (c) => {
    const body = await readJson(c);
    const parsed = parsePageBody(body, true);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const { db } = await import("edgespark");
    const now = Date.now();
    try {
      const id = newId();
      const value = parsed.value;
      const insertPage = db.insert(pages).values({
        id,
        slug: value.slug,
        title: value.title,
        displayName: value.displayName,
        bio: value.bio ?? null,
        avatarS3Uri: null,
        coverS3Uri: null,
        socialLinksJson: value.socialLinksJson ?? "[]",
        themeJson: value.themeJson ?? JSON.stringify(defaultTheme()),
        isDefault: value.isDefault ? 1 : 0,
        publishedAt: value.published ? now : null,
        lockVersion: 0,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const results = value.isDefault
        ? await db.batch([
            db.update(pages).set({ isDefault: 0, updatedAt: now }).where(and(isNull(pages.deletedAt), eq(pages.isDefault, 1))),
            insertPage.returning(),
          ])
        : [null, await insertPage.returning()];
      const [page] = results[1] as Array<typeof pages.$inferSelect>;
      return c.json({ page: formatPage(page) }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) return httpError(c, 409, "page_conflict", "A page with that slug already exists.");
      throw error;
    }
  })
  .get("/pages/:pageId", async (c) => {
    const page = await loadPage(c);
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    return c.json({ page: formatPage(page) });
  })
  .patch("/pages/:pageId", async (c) => {
    const body = await readJson(c);
    const parsed = parsePageBody(body, false);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    if (Object.keys(parsed.value).length === 0) return httpError(c, 400, "invalid_request", "At least one field is required.");
    const { db } = await import("edgespark");
    const current = await loadPage(c);
    if (!current) return httpError(c, 404, "page_not_found", "Page not found.");
    if (!lockMatches(body, current.lockVersion)) return httpError(c, 409, "lock_conflict", "Page changed; reload before editing.");
    const set = {
      ...parsed.value,
      isDefault: parsed.value.isDefault === undefined ? undefined : parsed.value.isDefault ? 1 : 0,
      publishedAt: parsed.value.published === undefined ? undefined : parsed.value.published ? Date.now() : null,
      lockVersion: current.lockVersion + 1,
      updatedAt: Date.now(),
    };
    delete (set as { published?: unknown }).published;
    const updatePage = db.update(pages).set(set).where(and(eq(pages.id, current.id), eq(pages.lockVersion, current.lockVersion), isNull(pages.deletedAt))).returning();
    const results = parsed.value.isDefault === true
      ? await db.batch([
          db.update(pages).set({ isDefault: 0, updatedAt: Date.now() }).where(and(isNull(pages.deletedAt), eq(pages.isDefault, 1))),
          updatePage,
        ])
      : [null, await updatePage];
    const [page] = results[1] as Array<typeof pages.$inferSelect>;
    if (!page) return httpError(c, 409, "lock_conflict", "Page changed; reload before editing.");
    return c.json({ page: formatPage(page) });
  })
  .delete("/pages/:pageId", async (c) => {
    const { db } = await import("edgespark");
    const [page] = await db.update(pages).set({ deletedAt: Date.now(), updatedAt: Date.now() })
      .where(and(eq(pages.id, c.req.param("pageId")), isNull(pages.deletedAt))).returning({ id: pages.id });
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    return c.json({ deleted: true });
  })
  .get("/pages/:pageId/links", async (c) => {
    const page = await loadPage(c);
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    const { db } = await import("edgespark");
    const rows = await db.select().from(links)
      .where(and(eq(links.pageId, page.id), isNull(links.deletedAt)))
      .orderBy(asc(links.position), asc(links.createdAt));
    return c.json({ links: rows.map(formatLink) });
  })
  .post("/pages/:pageId/links", async (c) => {
    const page = await loadPage(c);
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    const body = await readJson(c);
    const parsed = parseLinkBody(body, true);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    const { db } = await import("edgespark");
    const now = Date.now();
    const value = parsed.value;
    const [link] = await db.insert(links).values({
      id: newId(),
      pageId: page.id,
      title: value.title,
      url: value.url,
      description: value.description ?? null,
      thumbnailS3Uri: null,
      position: value.position ?? now,
      isActive: value.isActive === false ? 0 : 1,
      isFeatured: value.isFeatured ? 1 : 0,
      linkKind: value.linkKind ?? "link",
      deletedAt: null,
      lockVersion: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return c.json({ link: formatLink(link) }, 201);
  })
  .patch("/pages/:pageId/links/:linkId", async (c) => {
    const current = await loadLink(c);
    if (!current) return httpError(c, 404, "link_not_found", "Link not found.");
    const body = await readJson(c);
    const parsed = parseLinkBody(body, false);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
    if (parsed.value.linkKind === "link" && parsed.value.url === undefined && !isHttpUrl(current.url)) {
      return httpError(c, 400, "invalid_request", "url must be absolute http(s) when linkKind is link.");
    }
    if (!lockMatches(body, current.lockVersion)) return httpError(c, 409, "lock_conflict", "Link changed; reload before editing.");
    const { db } = await import("edgespark");
    const [link] = await db.update(links).set({
      ...parsed.value,
      isActive: parsed.value.isActive === undefined ? undefined : parsed.value.isActive ? 1 : 0,
      isFeatured: parsed.value.isFeatured === undefined ? undefined : parsed.value.isFeatured ? 1 : 0,
      lockVersion: current.lockVersion + 1,
      updatedAt: Date.now(),
    }).where(and(eq(links.id, current.id), eq(links.pageId, current.pageId), eq(links.lockVersion, current.lockVersion), isNull(links.deletedAt))).returning();
    if (!link) return httpError(c, 409, "lock_conflict", "Link changed; reload before editing.");
    return c.json({ link: formatLink(link) });
  })
  .delete("/pages/:pageId/links/:linkId", async (c) => {
    const current = await loadLink(c);
    if (!current) return httpError(c, 404, "link_not_found", "Link not found.");
    const { db } = await import("edgespark");
    await db.update(links).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(eq(links.id, current.id));
    return c.json({ deleted: true });
  })
  .post("/pages/:pageId/links/reorder", async (c) => {
    const page = await loadPage(c);
    if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
    const body = await readJson(c);
    if (!isRecord(body) || !Array.isArray(body.items)) return httpError(c, 400, "invalid_request", "items is required.");
    const { db } = await import("edgespark");
    const now = Date.now();
    const items: Array<{ id: string; position: number }> = [];
    for (const item of body.items) {
      if (!isRecord(item) || typeof item.id !== "string" || !Number.isSafeInteger(item.position)) {
        return httpError(c, 400, "invalid_request", "Each item needs id and integer position.");
      }
      items.push({ id: item.id, position: Number(item.position) });
    }
    if (items.length === 0) return httpError(c, 400, "invalid_request", "items must not be empty.");
    const ids = items.map((item) => item.id);
    const existing = ids.length
      ? await db.select({ id: links.id }).from(links).where(and(eq(links.pageId, page.id), inArray(links.id, ids), isNull(links.deletedAt)))
      : [];
    if (existing.length !== ids.length) return httpError(c, 404, "link_not_found", "One or more links were not found.");
    const reorderStatements = [
      ...items.map((item, index) => db.update(links).set({ position: -1_000_000 - index }).where(and(eq(links.id, item.id), eq(links.pageId, page.id)))),
      ...items.map((item) => db.update(links).set({ position: item.position, updatedAt: now, lockVersion: sql`${links.lockVersion} + 1` }).where(and(eq(links.id, item.id), eq(links.pageId, page.id)))),
    ] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
    await db.batch(reorderStatements);
    const rows = await db.select().from(links).where(and(eq(links.pageId, page.id), isNull(links.deletedAt))).orderBy(asc(links.position), asc(links.createdAt));
    return c.json({ links: rows.map(formatLink) });
  })
  .post("/pages/:pageId/assets/presign", (c) => presignPageAsset(c))
  .post("/pages/:pageId/assets/confirm", (c) => confirmPageAsset(c))
  .post("/pages/:pageId/links/:linkId/assets/presign", (c) => presignLinkAsset(c))
  .post("/pages/:pageId/links/:linkId/assets/confirm", (c) => confirmLinkAsset(c));

async function presignPageAsset(c: Context) {
  const page = await loadPage(c);
  if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
  const body = await readJson(c);
  const parsed = parseAssetBody(body, ["avatar", "cover"]);
  if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
  const assetId = newId();
  const key = `pages/${page.id}/${parsed.value.kind}s/${assetId}/${sanitizeFilename(parsed.value.filename)}`;
  const { storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const presigned = await storage.from(buckets.perchMedia).createPresignedPutUrl(key, 900, { contentType: parsed.value.contentType });
  return c.json({ assetId, key, uploadUrl: presigned.uploadUrl, requiredHeaders: presigned.requiredHeaders }, 201);
}

async function confirmPageAsset(c: Context) {
  const page = await loadPage(c);
  if (!page) return httpError(c, 404, "page_not_found", "Page not found.");
  const body = await readJson(c);
  const parsed = parseConfirmBody(body, ["avatar", "cover"]);
  if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
  const keyPrefix = `pages/${page.id}/${parsed.value.kind}s/${parsed.value.assetId}/`;
  const key = await findUploadedKey(keyPrefix);
  if (!key.ok) return httpError(c, key.status, key.code, key.message);
  const { db, storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const s3Uri = storage.createS3Uri(buckets.perchMedia, key.path);
  const patch = parsed.value.kind === "avatar" ? { avatarS3Uri: s3Uri } : { coverS3Uri: s3Uri };
  const [updated] = await db.update(pages).set({ ...patch, updatedAt: Date.now(), lockVersion: page.lockVersion + 1 })
    .where(and(eq(pages.id, page.id), isNull(pages.deletedAt))).returning();
  return c.json({ page: formatPage(updated) });
}

async function presignLinkAsset(c: Context) {
  const link = await loadLink(c);
  if (!link) return httpError(c, 404, "link_not_found", "Link not found.");
  const body = await readJson(c);
  const parsed = parseAssetBody(body, ["thumbnail"]);
  if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
  const assetId = newId();
  const key = `pages/${link.pageId}/links/${link.id}/${assetId}/${sanitizeFilename(parsed.value.filename)}`;
  const { storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const presigned = await storage.from(buckets.perchMedia).createPresignedPutUrl(key, 900, { contentType: parsed.value.contentType });
  return c.json({ assetId, key, uploadUrl: presigned.uploadUrl, requiredHeaders: presigned.requiredHeaders }, 201);
}

async function confirmLinkAsset(c: Context) {
  const link = await loadLink(c);
  if (!link) return httpError(c, 404, "link_not_found", "Link not found.");
  const body = await readJson(c);
  const parsed = parseConfirmBody(body, ["thumbnail"]);
  if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);
  const keyPrefix = `pages/${link.pageId}/links/${link.id}/${parsed.value.assetId}/`;
  const key = await findUploadedKey(keyPrefix);
  if (!key.ok) return httpError(c, key.status, key.code, key.message);
  const { db, storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const s3Uri = storage.createS3Uri(buckets.perchMedia, key.path);
  const [updated] = await db.update(links).set({ thumbnailS3Uri: s3Uri, updatedAt: Date.now(), lockVersion: link.lockVersion + 1 })
    .where(and(eq(links.id, link.id), isNull(links.deletedAt))).returning();
  return c.json({ link: formatLink(updated) });
}

async function findUploadedKey(prefix: string) {
  const { storage } = await import("edgespark");
  const { buckets } = await import("@defs");
  const bucket = storage.from(buckets.perchMedia);
  const listed = await bucket.list({ prefix, limit: 2 });
  const file = listed.files[0];
  if (!file) return { ok: false as const, status: 404, code: "upload_not_found", message: "Upload not found." };
  if (listed.files.length > 1) return { ok: false as const, status: 400, code: "ambiguous_upload", message: "Only one uploaded file is allowed per asset." };
  const meta = await bucket.head(file.path);
  if (!meta) return { ok: false as const, status: 404, code: "upload_not_found", message: "Upload not found." };
  if (!meta.contentType || !IMAGE_TYPES.has(meta.contentType)) {
    await bucket.delete(file.path);
    return { ok: false as const, status: 415, code: "invalid_content_type", message: "Uploaded file type is not supported." };
  }
  if (meta.size > MAX_IMAGE_BYTES) {
    await bucket.delete(file.path);
    return { ok: false as const, status: 413, code: "file_too_large", message: "File is too large." };
  }
  return { ok: true as const, path: file.path };
}

async function loadPage(c: Context) {
  const { db } = await import("edgespark");
  const pageId = c.req.param("pageId");
  if (!pageId) return null;
  return (await db.select().from(pages).where(and(eq(pages.id, pageId), isNull(pages.deletedAt))).limit(1))[0] ?? null;
}

async function loadLink(c: Context) {
  const { db } = await import("edgespark");
  const pageId = c.req.param("pageId");
  const linkId = c.req.param("linkId");
  if (!pageId || !linkId) return null;
  return (await db.select().from(links).where(and(eq(links.id, linkId), eq(links.pageId, pageId), isNull(links.deletedAt))).limit(1))[0] ?? null;
}

function formatPage(row: typeof pages.$inferSelect) {
  return { ...row, isDefault: row.isDefault === 1, theme: safeJson(row.themeJson, {}), socialLinks: safeJson(row.socialLinksJson, []) };
}

function formatLink(row: typeof links.$inferSelect) {
  return { ...row, isActive: row.isActive === 1, isFeatured: row.isFeatured === 1 };
}

async function readJson(c: Context): Promise<unknown> {
  try { return await c.req.json(); } catch { return null; }
}

type PageInput = {
  slug?: string;
  title?: string;
  displayName?: string;
  bio?: string;
  themeJson?: string;
  socialLinksJson?: string;
  isDefault?: boolean;
  published?: boolean;
};
type CreatePageInput = PageInput & { slug: string; title: string; displayName: string };
type LinkInput = {
  title?: string;
  url?: string;
  description?: string;
  position?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  linkKind?: string;
};
type CreateLinkInput = LinkInput & { title: string; url: string };
type Failure = { ok: false; message: string }; type Success<T> = { ok: true; value: T };
const fail = (message: string): Failure => ({ ok: false, message });
function parsePageBody(body: unknown, creating: true): Success<CreatePageInput> | Failure;
function parsePageBody(body: unknown, creating: false): Success<PageInput> | Failure;
function parsePageBody(body: unknown, creating: boolean): Success<PageInput> | Failure {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  const value: PageInput = {};
  if (body.slug !== undefined || creating) {
    if (typeof body.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(body.slug)) {
      return fail("slug must be 2-64 lowercase letters, numbers, or hyphens.");
    }
    value.slug = body.slug;
  }
  for (const key of ["title", "displayName", "bio"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || body[key].length > (key === "bio" ? 1000 : 160)) return fail(`${key} is invalid.`);
      value[key] = body[key].trim();
    } else if (creating && key !== "bio") return fail(`${key} is required.`);
  }
  try {
    if (body.theme !== undefined) value.themeJson = cappedJson(body.theme, "theme");
    if (body.socialLinks !== undefined) value.socialLinksJson = cappedJson(normalizeSocialLinks(body.socialLinks), "socialLinks");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "JSON field is too large.");
  }
  if (body.isDefault !== undefined) value.isDefault = Boolean(body.isDefault);
  if (body.published !== undefined) value.published = Boolean(body.published);
  return { ok: true, value };
}

function parseLinkBody(body: unknown, creating: true): Success<CreateLinkInput> | Failure;
function parseLinkBody(body: unknown, creating: false): Success<LinkInput> | Failure;
function parseLinkBody(body: unknown, creating: boolean): Success<LinkInput> | Failure {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  const value: LinkInput = {};
  if (body.title !== undefined || creating) {
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 160) {
      return fail("title is required.");
    }
    value.title = body.title.trim();
  }
  if (body.linkKind !== undefined) {
    if (body.linkKind !== "link" && body.linkKind !== "section") return fail("linkKind must be link or section.");
    value.linkKind = body.linkKind;
  }
  if (body.url !== undefined || (creating && body.linkKind !== "section")) {
    if (typeof body.url !== "string" || !isHttpUrl(body.url)) return fail("url must be absolute http(s).");
    value.url = body.url;
  } else if (creating && body.linkKind === "section") {
    value.url = "";
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 500) return fail("description is invalid.");
    value.description = body.description.trim();
  }
  if (body.position !== undefined) {
    if (!Number.isSafeInteger(body.position)) return fail("position must be an integer.");
    value.position = Number(body.position);
  }
  if (body.isActive !== undefined) value.isActive = Boolean(body.isActive);
  if (body.isFeatured !== undefined) value.isFeatured = Boolean(body.isFeatured);
  return { ok: true, value };
}

function parseAssetBody(body: unknown, kinds: readonly string[]) {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  if (typeof body.kind !== "string" || !kinds.includes(body.kind)) return fail(`kind must be ${kinds.join(" or ")}.`);
  if (typeof body.filename !== "string" || !body.filename.trim()) return fail("filename is required.");
  if (typeof body.contentType !== "string" || !IMAGE_TYPES.has(body.contentType)) return fail("contentType must be a supported image type.");
  return { ok: true as const, value: { kind: body.kind, filename: body.filename, contentType: body.contentType } };
}

function parseConfirmBody(body: unknown, kinds: readonly string[]) {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  if (typeof body.kind !== "string" || !kinds.includes(body.kind)) return fail(`kind must be ${kinds.join(" or ")}.`);
  if (typeof body.assetId !== "string" || !/^[0-9a-f-]{20,}$/.test(body.assetId)) return fail("assetId is invalid.");
  return { ok: true as const, value: { kind: body.kind, assetId: body.assetId } };
}

function cappedJson(value: unknown, name: string): string {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) throw new Error(`${name} is too large.`);
  return json;
}

function defaultTheme() {
  return { background: "#f7f2ea", foreground: "#181612", card: "#fffaf2", accent: "#2b7c6f", radius: "18px" };
}
function safeJson(raw: string, fallback: unknown): unknown {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function lockMatches(body: unknown, current: number): boolean {
  return !isRecord(body) || body.lockVersion === undefined || body.lockVersion === current;
}

function sanitizeFilename(filename: string): string {
  return filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "upload";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

const PAGE_SORT: Record<string, typeof pages.updatedAt | typeof pages.createdAt | typeof pages.title | typeof pages.slug> = {
  updatedAt: pages.updatedAt,
  createdAt: pages.createdAt,
  title: pages.title,
  slug: pages.slug,
};

function parsePage(rawLimit: string | undefined, rawOffset: string | undefined): { limit: number; offset: number } {
  const l = Number(rawLimit);
  const limit = rawLimit && Number.isSafeInteger(l) ? Math.max(1, Math.min(l, 100)) : 20;
  const o = Number(rawOffset);
  const offset = rawOffset && Number.isSafeInteger(o) && o > 0 ? o : 0;
  return { limit, offset };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
