import { Hono } from "hono";
import { db, ctx, storage } from "edgespark";
import { and, eq } from "drizzle-orm";
import { assetFolders, assets, cards } from "@defs";
import { buildPresignedGetPlaceholder, describeAssetFromUrl, safePresignPreview } from "../lib/description/autotag";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord, parseJson } from "../lib/json";
import { materializePendingAsset } from "../lib/imagegen/materialize";
import { gcOrphanMedia } from "../lib/storage/gc";
import { reconcileAssetRow, reconcileAssetRows } from "../lib/reconcile";
import { approvedUserOrAgentKey, ownerSessionOrOwnerToken, type AppEnv } from "../middleware/managementAuth";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;

export const assetRoutes = new Hono<AppEnv>()
  .use("*", approvedUserOrAgentKey)
  // Asset library list for the Quill panel: soft-deleted excluded, real presigned previewUrls
  // (M-212), explicit status field, paginated. Never returns raw s3_uri.
  .get("/assets", async (c) => {
    const limit = clampInt(c.req.query("limit"), LIST_DEFAULT_LIMIT, 1, LIST_MAX_LIMIT);
    const offset = clampInt(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const folderId = c.req.query("folderId");
    const status = c.req.query("status");
    const live = (await db.select().from(assets)).filter((row: any) => !row.deletedAt);
    // Reconcile stale "generating" rows to "failed" before filtering/serializing (M-102 layer 2).
    const reconciled = await reconcileAssetRows(live);
    const all = reconciled
      .filter((row: any) => (folderId ? row.folderId === folderId : true))
      .filter((row: any) => (status ? assetStatus(row) === status : true))
      .sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
    const page = all.slice(offset, offset + limit);
    const items = await Promise.all(page.map((row: any) => publicAsset(row)));
    return c.json({ assets: items, page: { limit, offset, total: all.length } });
  })
  .post("/assets/:id/materialize", async (c) => {
    const found = await assetById(c.req.param("id"));
    if (!found || found.deletedAt) return httpError(c, 404, "not_found", "Asset not found.");
    const materialized = canMaterialize(found, c.get("principal")) ? await materializePendingAsset(found.id) : { asset: found };
    const row = await reconcileAssetRow(materialized.asset ?? found);
    return c.json({ asset: await publicAsset(row) });
  })
  .get("/assets/:id", async (c) => {
    const found = await assetById(c.req.param("id"));
    if (!found || found.deletedAt) return httpError(c, 404, "not_found", "Asset not found.");
    const materialized = canMaterialize(found, c.get("principal")) ? await materializePendingAsset(found.id) : { asset: found };
    const row = await reconcileAssetRow(materialized.asset ?? found); // M-102 layer 2: stale non-lazy generating → failed
    return c.json({ asset: await publicAsset(row) });
  })
  .get("/assets/:id/file", async (c) => {
    const found = await assetById(c.req.param("id"));
    if (!found || found.deletedAt) return httpError(c, 404, "not_found", "Asset not found.");
    const materialized = canMaterialize(found, c.get("principal")) ? await materializePendingAsset(found.id) : { asset: found };
    const row = await reconcileAssetRow(materialized.asset ?? found);
    if (assetStatus(row) !== "ready") return httpError(c, 404, "asset_not_ready", "Asset bytes are not ready.");
    const parsed = storage.tryParseS3Uri(row.s3Uri);
    if (!parsed) return httpError(c, 404, "asset_not_fetchable", "Asset bytes are not fetchable.");
    const object = await storage.from(parsed.bucket).get(parsed.path);
    if (!object) return httpError(c, 404, "asset_bytes_missing", "Asset bytes not found.");
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": row.contentType || object.metadata.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  })
  .post("/assets", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const body = await readAssetCreateBody(c);
    if (!isRecord(body) || typeof body.s3Uri !== "string" || typeof body.contentType !== "string") return httpError(c, 400, "invalid_request", "s3Uri and contentType are required.");
    if (body.s3Uri.startsWith("http")) return httpError(c, 400, "raw_uri_forbidden", "Raw public asset URLs are not accepted.");
    const now = Date.now();
    const id = newId("asset");
    await db.insert(assets).values({
      id,
      kind: String(body.kind ?? "image"),
      source: String(body.source ?? "upload"),
      folderId: typeof body.folderId === "string" ? body.folderId : null,
      ownerUserId: userId,
      name: String(body.name ?? "Untitled asset"),
      s3Uri: body.s3Uri,
      contentType: body.contentType,
      byteSize: Number(body.byteSize ?? 0),
      width: Number.isFinite(Number(body.width)) ? Number(body.width) : null,
      height: Number.isFinite(Number(body.height)) ? Number(body.height) : null,
      transparent: body.transparent ? 1 : 0,
      tagsJson: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      provenanceJson: JSON.stringify(body.provenance ?? {}),
      createdAt: now,
      updatedAt: now,
    });
    queueDescription({ assetId: id, s3Uri: body.s3Uri, userId, agentRunId: typeof body.agentRunId === "string" ? body.agentRunId : null });
    return c.json({ id, asset: await publicAsset(await assetById(id)) }, 201);
  })
  .patch("/assets/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
    const asset = await mutableAsset(c.req.param("id"), c.get("principal"));
    if ("response" in asset) return asset.response;
    if (!Number.isInteger(body.lockVersion) || Number(body.lockVersion) !== Number(asset.row.lockVersion ?? 0)) return httpError(c, 409, "lock_version_conflict", "Asset lockVersion is stale.");
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof body.name === "string") update.name = body.name;
    if (typeof body.folderId === "string" || body.folderId === null) update.folderId = body.folderId;
    if (Array.isArray(body.tags)) update.tagsJson = JSON.stringify(body.tags.map(String));
    update.lockVersion = Number(body.lockVersion) + 1;
    const result = await db.update(assets).set(update).where(and(eq(assets.id, c.req.param("id")), eq(assets.lockVersion, Number(body.lockVersion))));
    if (await updateMissed(result)) {
      const current = await assetById(c.req.param("id"));
      return httpError(c, 409, "lock_version_conflict", "Asset lockVersion is stale.", { current });
    }
    return c.json({ ok: true });
  })
  .delete("/assets/:id", async (c) => {
    const assetId = c.req.param("id");
    const asset = await mutableAsset(assetId, c.get("principal"));
    if ("response" in asset) return asset.response;
    const lockVersion = Number(c.req.query("lockVersion"));
    if (!Number.isInteger(lockVersion) || lockVersion !== Number(asset.row.lockVersion ?? 0)) return httpError(c, 409, "lock_version_conflict", "Asset lockVersion is stale.");
    const used = (await db.select().from(cards)).filter((card: any) => assetUsedByCard(assetId, card)).length;
    const doubleConfirm = c.req.query("confirm_used") === "true" && c.req.query("confirm_retention") === "true";
    if (used > 0 && !doubleConfirm) return httpError(c, 409, "double_confirm_required", "Asset is used by cards; confirm_used=true and confirm_retention=true are required.", { usedByCards: used });
    const result = await db.update(assets).set({ deletedAt: Date.now(), purgeAfter: Date.now() + RETENTION_MS, updatedAt: Date.now(), lockVersion: lockVersion + 1 }).where(and(eq(assets.id, assetId), eq(assets.lockVersion, lockVersion)));
    if (await updateMissed(result)) {
      const current = await assetById(assetId);
      return httpError(c, 409, "lock_version_conflict", "Asset lockVersion is stale.", { current });
    }
    return c.json({ ok: true, purgeAfterDays: 30 });
  })
  .get("/asset-folders", async (c) => c.json({ folders: await db.select().from(assetFolders) }))
  .post("/asset-folders", async (c) => {
    const principal = c.get("principal");
    const userId = principalUserId(principal);
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body) || typeof body.name !== "string") return httpError(c, 400, "name_required", "Folder name is required.");
    const parent = typeof body.parentFolderId === "string" ? (await db.select().from(assetFolders)).find((folder: any) => folder.id === body.parentFolderId) : null;
    const depth = parent ? Number(parent.depth ?? 0) + 1 : 0;
    if (depth > 2) return httpError(c, 400, "folder_depth_exceeded", "Asset folders support at most 3 levels.");
    const now = Date.now();
    const id = newId("folder");
    await db.insert(assetFolders).values({ id, name: body.name, parentFolderId: parent?.id ?? null, depth, ownerUserId: userId, createdAt: now, updatedAt: now });
    return c.json({ id }, 201);
  });

export const adminAssetRoutes = new Hono<AppEnv>()
  // Owner-only R2 garbage collector (M-213): deletes media objects with no asset-row reference.
  // POST /admin/assets/gc?dryRun=true previews; without dryRun it deletes. API keys can never
  // reach this (ownerSessionOrOwnerToken rejects agent principals).
  .post("/admin/assets/gc", ownerSessionOrOwnerToken, async (c) => {
    const dryRun = c.req.query("dryRun") === "true";
    const result = await gcOrphanMedia({ dryRun });
    return c.json(result);
  })
  .get("/admin/assets/:id", ownerSessionOrOwnerToken, async (c) => {
    const [asset] = await db.select().from(assets).where(eq(assets.id, c.req.param("id"))).limit(1);
    return asset ? c.json({ asset }) : httpError(c, 404, "not_found", "Asset not found.");
  })
  .post("/assets/:id/describe", ownerSessionOrOwnerToken, async (c) => {
    const [asset] = await db.select().from(assets).where(eq(assets.id, c.req.param("id"))).limit(1);
    if (!asset) return httpError(c, 404, "not_found", "Asset not found.");
    const sentence = await describeAssetFromUrl({ assetId: asset.id, userId: asset.ownerUserId ?? "system", imageUrl: buildPresignedGetPlaceholder(asset.s3Uri) });
    await db.update(assets).set({ description: sentence, descriptionSource: "llm-auto", descriptionGeneratedAt: Date.now(), updatedAt: Date.now() }).where(eq(assets.id, asset.id));
    return c.json({ id: asset.id, description: sentence });
  });

function queueDescription(input: { assetId: string; s3Uri: string; userId: string; agentRunId?: string | null }): void {
  const task = (async () => {
    try {
      const description = await describeAssetFromUrl({ ...input, imageUrl: buildPresignedGetPlaceholder(input.s3Uri) });
      await db.update(assets).set({ description, descriptionSource: "llm-auto", descriptionGeneratedAt: Date.now(), updatedAt: Date.now() }).where(eq(assets.id, input.assetId));
    } catch {
      // Async metadata failure must not block upload.
    }
  })();
  ctx.runInBackground ? ctx.runInBackground(task) : void task;
}

function assetUsedByCard(assetId: string, card: any): boolean {
  if (card.primaryAssetId === assetId) return true;
  const slots = parseJson<Record<string, unknown>>(card.slotAssignmentsJson, {});
  return JSON.stringify(slots).includes(assetId);
}

function principalUserId(principal: AppEnv["Variables"]["principal"]): string | null {
  return principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
}

function isOwnerAdmin(principal: AppEnv["Variables"]["principal"]): boolean {
  return principal.kind === "owner" || (principal.kind === "user" && principal.role === "owner");
}

function canMaterialize(row: any, principal: AppEnv["Variables"]["principal"]): boolean {
  if (isOwnerAdmin(principal)) return true;
  const userId = principalUserId(principal);
  return !!userId && userId === row.ownerUserId;
}

async function mutableAsset(id: string, principal: AppEnv["Variables"]["principal"]): Promise<{ row: any } | { response: Response }> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!row || row.deletedAt) return { response: new Response(JSON.stringify({ error: { code: "not_found", message: "Asset not found.", requestId: crypto.randomUUID() } }), { status: 404, headers: { "Content-Type": "application/json" } }) };
  const userId = principalUserId(principal);
  if (!isOwnerAdmin(principal) && (!userId || row.ownerUserId !== userId)) {
    return { response: new Response(JSON.stringify({ error: { code: "forbidden", message: "Only the uploader or owner admin can mutate this asset.", requestId: crypto.randomUUID() } }), { status: 403, headers: { "Content-Type": "application/json" } }) };
  }
  return { row };
}

async function assetById(id: string) {
  return (await db.select().from(assets)).find((row: any) => row.id === id) ?? null;
}

async function readAssetCreateBody(c: any): Promise<Record<string, unknown> | null> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return c.req.json().catch(() => null);
  const form = await c.req.formData().catch(() => null);
  if (!form) return null;
  const file = form.get("file");
  const name = typeof form.get("name") === "string" ? String(form.get("name")) : file instanceof File ? file.name : "Uploaded asset";
  const idHint = newId("upload");
  return {
    name,
    s3Uri: `r2://magpie/assets/uploads/${idHint}-${name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`,
    contentType: file instanceof File && file.type ? file.type : String(form.get("contentType") ?? "application/octet-stream"),
    byteSize: file instanceof File ? file.size : Number(form.get("byteSize") ?? 0),
    folderId: typeof form.get("folderId") === "string" && form.get("folderId") ? String(form.get("folderId")) : null,
    kind: String(form.get("kind") ?? "image"),
    source: "upload",
    transparent: String(form.get("transparent") ?? "") === "true",
  };
}

// Bytes lifecycle. Pre-existing rows have no `status` column value in the in-memory mock; treat
// missing as "ready" (D1 backfills the default for real rows).
function assetStatus(row: any): "generating" | "ready" | "failed" {
  const s = row?.status;
  return s === "generating" || s === "rendering" || s === "failed" ? s === "failed" ? "failed" : "generating" : "ready";
}

// Public projection of an asset row. NEVER leaks raw s3_uri. previewUrl is a real presigned GET
// URL (M-212) and is only emitted when the bytes are actually present (status="ready"), so a
// non-null previewUrl reliably means "ready to render" for the Quill panel.
async function publicAsset(row: any) {
  if (!row) return null;
  const status = assetStatus(row);
  const previewUrl = status === "ready" ? await safePresignPreview(row.s3Uri) : null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    folderId: row.folderId ?? null,
    status,
    description: row.description ?? null,
    descriptionStatus: row.description ? "ready" : "pending",
    previewUrl,
    width: row.width ?? null,
    height: row.height ?? null,
    transparent: Number(row.transparent ?? 0),
    byteSize: Number(row.byteSize ?? 0),
    tags: parseJson<string[]>(row.tagsJson, []),
    lockVersion: Number(row.lockVersion ?? 0),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function updateMissed(result: unknown): Promise<boolean> {
  const affected = affectedRows(result);
  if (affected !== null) return affected === 0;
  throw new Error("driver_lacks_row_count");
}

function affectedRows(result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, any>;
  return Number.isInteger(r.rowsAffected) ? r.rowsAffected : Number.isInteger(r.changes) ? r.changes : Number.isInteger(r.meta?.changes) ? r.meta.changes : null;
}
