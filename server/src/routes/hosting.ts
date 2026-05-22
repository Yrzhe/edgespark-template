/**
 * HOSTING LANE (Plan 2) — owner/agent site management + public serving.
 *
 * Mounted in src/index.ts as:
 *   app.route("/api/public/manage", hostingManageRoutes)  // sites, deploys, files, versions, keys
 *   app.route("/api/public/s", serveRoutes)               // public static serving
 *
 * `hostingManageRoutes` is gated by managementAuth (applied to /api/public/manage/* in index.ts);
 * read `c.get("principal")`. `serveRoutes` is PUBLIC.
 *
 * Codex lane A fills these in per docs/implementation/2026-05-22-plan-2-hosting.md.
 * Do NOT edit src/defs/** or src/index.ts.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { apiKeys, sites, versions } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { generateApiKey } from "../lib/keys";
import {
  createDeploy,
  createUploadMap,
  deleteSingleFile,
  existingHashesForManifest,
  finalizeDeploy,
  missingHashesForManifest,
  normalizeDeployManifest,
  putSingleFile,
} from "../lib/hosting/deploy";
import { gcAfterDeploy } from "../lib/hosting/gc";
import { buildLlmsTxt } from "../lib/hosting/llms";
import { rawServePathFromUrl, serveSiteFile } from "../lib/hosting/serve";
import { createSite, findActiveSite, hardDeleteSite, isUniqueConstraintError } from "../lib/hosting/sites";

type CreateSiteBody = { name: string; slug?: string; spaMode?: boolean };
type PatchSiteBody = { name?: string; slug?: string; spaMode?: boolean };

export const hostingManageRoutes = new Hono<AppEnv>()
  .get("/keys", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));
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
    const [row] = await db
      .insert(apiKeys)
      .values({
        id: newId(),
        name: body.name.trim(),
        keyHash: key.hash,
        prefix: key.prefix,
        createdAt: now,
        lastUsedAt: null,
        revokedAt: null,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      });
    return c.json({ key: row, plaintext: key.plaintext }, 201);
  })
  .delete("/keys/:id", async (c) => {
    const { db } = await import("edgespark");
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: Date.now() })
      .where(and(eq(apiKeys.id, c.req.param("id")), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    if (!row) return httpError(c, 404, "key_not_found", "API key not found.");
    return c.json({ revoked: true });
  })
  .get("/sites", async (c) => {
    const { db } = await import("edgespark");
    const rows = await db.select().from(sites).where(isNull(sites.deletedAt)).orderBy(desc(sites.createdAt));
    return c.json({ sites: rows.map(formatSite) });
  })
  .post("/sites", async (c) => {
    const body = await readJson(c);
    const parsed = parseCreateSite(body);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);

    const { db } = await import("edgespark");
    try {
      const site = await createSite(db, parsed.value);
      return c.json({ site: formatSite(site), siteKey: site.siteKey }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return httpError(c, 409, "site_conflict", "A site with that slug or key already exists.");
      }
      throw error;
    }
  })
  .get("/sites/:id", async (c) => {
    const { db } = await import("edgespark");
    const site = await findActiveSite(db, c.req.param("id"));
    if (!site) return httpError(c, 404, "site_not_found", "Site not found.");

    const currentVersion = site.currentVersionId
      ? (
          await db
            .select({
              id: versions.id,
              status: versions.status,
              fileCount: versions.fileCount,
              totalBytes: versions.totalBytes,
              createdAt: versions.createdAt,
              committedAt: versions.committedAt,
            })
            .from(versions)
            .where(eq(versions.id, site.currentVersionId))
            .limit(1)
        )[0] ?? null
      : null;

    return c.json({ site: formatSite(site), currentVersion });
  })
  .patch("/sites/:id", async (c) => {
    const body = await readJson(c);
    const parsed = parsePatchSite(body);
    if (!parsed.ok) return httpError(c, 400, "invalid_request", parsed.message);

    const { db } = await import("edgespark");
    try {
      const [site] = await db
        .update(sites)
        .set({ ...parsed.value, updatedAt: Date.now() })
        .where(and(eq(sites.id, c.req.param("id")), isNull(sites.deletedAt)))
        .returning();
      if (!site) return httpError(c, 404, "site_not_found", "Site not found.");
      return c.json({ site: formatSite(site) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return httpError(c, 409, "site_conflict", "A site with that slug already exists.");
      }
      throw error;
    }
  })
  .post("/sites/:id/deploys", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "Request body must be a JSON object.");

    let manifest;
    try {
      manifest = normalizeDeployManifest(body.manifest);
    } catch (error) {
      return httpError(c, 400, "invalid_manifest", error instanceof Error ? error.message : "Invalid manifest.");
    }
    const note = parseDeployNote(body.note);
    if (note instanceof Error) return httpError(c, 400, "invalid_request", note.message);

    const { db, storage } = await import("edgespark");
    const site = await findActiveSite(db, c.req.param("id"));
    if (!site) return httpError(c, 404, "site_not_found", "Site not found.");

    const existingHashes = await existingHashesForManifest(db, manifest);
    const missingHashes = missingHashesForManifest(manifest, existingHashes);
    const { deployId } = await createDeploy({ db, siteId: site.id, manifest, note });
    const uploads = await createUploadMap({ storage, siteId: site.id, manifest, missingHashes });
    return c.json({ deployId, missingHashes, uploads }, 201);
  })
  .post("/sites/:id/deploys/:deployId/finalize", async (c) => {
    const { db, storage, ctx } = await import("edgespark");
    const result = await finalizeDeploy({
      db,
      storage,
      siteId: c.req.param("id"),
      deployId: c.req.param("deployId"),
    });
    if (result.ok) {
      ctx.runInBackground(gcAfterDeploy({ db, storage, siteId: c.req.param("id") }));
      return c.json({ deployId: result.deployId, status: "ready" });
    }
    if (result.code === "deploy_conflict") {
      return httpError(c, 409, "deploy_conflict", "The site changed while this deploy was finalizing.");
    }
    if (result.code === "site_not_found") return httpError(c, 404, "site_not_found", "Site not found.");
    if (result.code === "deploy_not_found") return httpError(c, 404, "deploy_not_found", "Deploy not found.");
    if (result.code === "size_mismatch") return httpError(c, 400, "size_mismatch", "Uploaded blob size does not match manifest.");
    return httpError(c, 400, "missing_blob", "One or more required blobs have not been uploaded.");
  })
  .put("/sites/:id/files/*", async (c) => {
    const { db, storage } = await import("edgespark");
    let result;
    try {
      result = await putSingleFile({
        db,
        storage,
        siteId: c.req.param("id"),
        rawPath: c.req.param("*") ?? "",
        body: await c.req.arrayBuffer(),
        contentType: c.req.header("content-type") ?? undefined,
      });
    } catch {
      return httpError(c, 400, "invalid_path", "Invalid file path.");
    }
    if (result.ok) return c.json({ versionId: result.versionId, path: result.path, hash: result.hash });
    if (result.code === "file_too_large") return httpError(c, 413, "file_too_large", "File is too large.");
    if (result.code === "deploy_conflict") return httpError(c, 409, "deploy_conflict", "The site changed while this file was being updated.");
    return httpError(c, 404, result.code, "Site or current version not found.");
  })
  .delete("/sites/:id/files/*", async (c) => {
    const { db } = await import("edgespark");
    let result;
    try {
      result = await deleteSingleFile({ db, siteId: c.req.param("id"), rawPath: c.req.param("*") ?? "" });
    } catch {
      return httpError(c, 400, "invalid_path", "Invalid file path.");
    }
    if (result.ok) return c.json({ versionId: result.versionId, path: result.path });
    if (result.code === "deploy_conflict") return httpError(c, 409, "deploy_conflict", "The site changed while this file was being deleted.");
    return httpError(c, 404, result.code, "Site or current version not found.");
  })
  .get("/sites/:id/versions", async (c) => {
    const { db } = await import("edgespark");
    const site = await findActiveSite(db, c.req.param("id"));
    if (!site) return httpError(c, 404, "site_not_found", "Site not found.");

    const limit = parseLimit(c.req.query("limit"));
    const before = parseCreatedBefore(c.req.query("before"));
    if (before instanceof Error) return httpError(c, 400, "invalid_request", before.message);
    const where = before
      ? and(eq(versions.siteId, site.id), lt(versions.createdAt, before))
      : eq(versions.siteId, site.id);
    const rows = await db
      .select({
        id: versions.id,
        parentVersionId: versions.parentVersionId,
        status: versions.status,
        note: versions.note,
        fileCount: versions.fileCount,
        totalBytes: versions.totalBytes,
        createdAt: versions.createdAt,
        committedAt: versions.committedAt,
        expiresAt: versions.expiresAt,
      })
      .from(versions)
      .where(where)
      .orderBy(desc(versions.createdAt))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return c.json({
      versions: page,
      nextBefore: rows.length > limit ? page[page.length - 1]?.createdAt ?? null : null,
    });
  })
  .post("/sites/:id/rollback", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.versionId !== "string") {
      return httpError(c, 400, "invalid_request", "versionId is required.");
    }

    const { db } = await import("edgespark");
    const site = await findActiveSite(db, c.req.param("id"));
    if (!site) return httpError(c, 404, "site_not_found", "Site not found.");

    const [target] = await db
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.id, body.versionId), eq(versions.siteId, site.id), eq(versions.status, "ready")))
      .limit(1);
    if (!target) return httpError(c, 404, "version_not_found", "Version not found.");

    const [updated] = await db
      .update(sites)
      .set({ currentVersionId: target.id, lockVersion: site.lockVersion + 1, updatedAt: Date.now() })
      .where(and(eq(sites.id, site.id), eq(sites.lockVersion, site.lockVersion), isNull(sites.deletedAt)))
      .returning({ id: sites.id });
    if (!updated) return httpError(c, 409, "rollback_conflict", "The site changed while rollback was being applied.");
    return c.json({ siteId: site.id, currentVersionId: target.id });
  })
  .delete("/sites/:id", async (c) => {
    const { db, storage, ctx } = await import("edgespark");
    const now = Date.now();
    const [site] = await db
      .update(sites)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(sites.id, c.req.param("id")), isNull(sites.deletedAt)))
      .returning();
    if (!site) return httpError(c, 404, "site_not_found", "Site not found.");

    ctx.runInBackground(hardDeleteSite({ db, storage, siteId: site.id }));
    return c.json({ accepted: true }, 202);
  });

export const serveRoutes = new Hono()
  .get("/:slug", async (c) => {
    const { db, storage } = await import("edgespark");
    return serveSiteFile({ db, storage, request: c.req.raw, slug: c.req.param("slug"), rawPath: "" });
  })
  .get("/:slug/*", async (c) => {
    const { db, storage } = await import("edgespark");
    const slug = c.req.param("slug");
    const rawPath = rawServePathFromUrl(c.req.url, slug);
    return serveSiteFile({ db, storage, request: c.req.raw, slug, rawPath });
  });

export const hostingPublicRoutes = new Hono()
  .get("/llms.txt", (c) => agentDocsResponse(c.req.url))
  .get("/agent.md", (c) => agentDocsResponse(c.req.url));

function agentDocsResponse(requestUrl: string): Response {
  const origin = new URL(requestUrl).origin;
  return new Response(buildLlmsTxt(origin), {
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function parseCreateSite(body: unknown): { ok: true; value: { name: string; slug?: string; spaMode: boolean } } | Failure {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  const base = parseSiteFields(body, true);
  if (!base.ok) return base;
  return { ok: true, value: { name: base.value.name!, slug: base.value.slug, spaMode: base.value.spaMode ?? false } };
}

function parsePatchSite(body: unknown): { ok: true; value: { name?: string; slug?: string; spaMode?: number } } | Failure {
  if (!isRecord(body)) return fail("Request body must be a JSON object.");
  const base = parseSiteFields(body, false);
  if (!base.ok) return base;
  const value: { name?: string; slug?: string; spaMode?: number } = {};
  if (base.value.name !== undefined) value.name = base.value.name;
  if (base.value.slug !== undefined) value.slug = base.value.slug;
  if (base.value.spaMode !== undefined) value.spaMode = base.value.spaMode ? 1 : 0;
  if (Object.keys(value).length === 0) return fail("At least one editable field is required.");
  return { ok: true, value };
}

type Failure = { ok: false; message: string };

function fail(message: string): Failure {
  return { ok: false, message };
}

function parseSiteFields(
  body: Record<string, unknown>,
  requireName: boolean
): { ok: true; value: { name?: string; slug?: string; spaMode?: boolean } } | Failure {
  const value: { name?: string; slug?: string; spaMode?: boolean } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.trim().length > 120) {
      return fail("name must be a non-empty string up to 120 characters.");
    }
    value.name = body.name.trim();
  } else if (requireName) {
    return fail("name is required.");
  }

  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(body.slug)) {
      return fail("slug must be 2-64 lowercase letters, numbers, or hyphens.");
    }
    value.slug = body.slug;
  }

  if (body.spaMode !== undefined) {
    if (typeof body.spaMode !== "boolean") return fail("spaMode must be a boolean.");
    value.spaMode = body.spaMode;
  }

  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDeployNote(value: unknown): string | undefined | Error {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > 2000) {
    return new Error("note must be a string up to 2000 characters.");
  }
  return value;
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return 50;
  return Math.max(1, Math.min(n, 100));
}

function parseCreatedBefore(raw: string | undefined): number | null | Error {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return new Error("before must be a non-negative integer timestamp.");
  return n;
}

function formatSite(row: typeof sites.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    currentVersionId: row.currentVersionId,
    siteKey: row.siteKey,
    spaMode: row.spaMode === 1,
    lockVersion: row.lockVersion,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
