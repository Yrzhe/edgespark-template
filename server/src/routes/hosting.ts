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
import { and, desc, eq, isNull } from "drizzle-orm";
import { sites, versions } from "@defs";
import type { AppEnv } from "../middleware/managementAuth";
import { httpError } from "../lib/httpErrors";
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
import { createSite, findActiveSite, hardDeleteSite, isUniqueConstraintError } from "../lib/hosting/sites";

type CreateSiteBody = { name: string; slug?: string; spaMode?: boolean };
type PatchSiteBody = { name?: string; slug?: string; spaMode?: boolean };

export const hostingManageRoutes = new Hono<AppEnv>()
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
    const { db, storage } = await import("edgespark");
    const result = await finalizeDeploy({
      db,
      storage,
      siteId: c.req.param("id"),
      deployId: c.req.param("deployId"),
    });
    if (result.ok) return c.json({ deployId: result.deployId, status: "ready" });
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

export const serveRoutes = new Hono().get("/*", (c) =>
  c.json({ error: { code: "not_implemented", message: "serve route pending (Plan 2)", requestId: crypto.randomUUID() } }, 501)
);

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
