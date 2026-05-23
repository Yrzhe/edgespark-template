import { and, eq, inArray, sql } from "drizzle-orm";
import { normalizeSitePath } from "../pathNormalize";
import { contentTypeFor } from "../contentType";
import { newId } from "../ids";
import { hostingBlobKey } from "./blobKeys";
import { TOMBSTONE_HASH } from "./serve";

type EdgeDb = typeof import("edgespark").db;
type EdgeStorage = typeof import("edgespark").storage;
type BatchStatement = Parameters<EdgeDb["batch"]>[0][number];

export type DeployManifestEntry = {
  path: string;
  hash: string;
  size: number;
  contentType: string;
};

type RawManifestEntry = {
  path?: unknown;
  hash?: unknown;
  size?: unknown;
  contentType?: unknown;
};

const BUILD_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/;

export function normalizeDeployManifest(raw: unknown): DeployManifestEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("manifest must be a non-empty array");
  const seenPaths = new Set<string>();

  return raw.map((entry) => {
    if (!isRecord(entry)) throw new Error("manifest entries must be objects");
    const item = normalizeDeployManifestEntry(entry);
    if (seenPaths.has(item.path)) throw new Error(`duplicate path in manifest: ${item.path}`);
    seenPaths.add(item.path);
    return item;
  });
}

export function missingHashesForManifest(
  manifest: readonly DeployManifestEntry[],
  existingHashes: ReadonlySet<string>
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const entry of manifest) {
    if (existingHashes.has(entry.hash) || seen.has(entry.hash)) continue;
    seen.add(entry.hash);
    missing.push(entry.hash);
  }
  return missing;
}

export async function existingHashesForManifest(
  db: EdgeDb,
  manifest: readonly DeployManifestEntry[]
): Promise<Set<string>> {
  const { contentBlobs } = await import("@defs");
  const hashes = [...new Set(manifest.map((entry) => entry.hash))];
  const existing = new Set<string>();
  for (const chunk of chunks(hashes, 90)) {
    const rows = await db.select({ hash: contentBlobs.hash }).from(contentBlobs).where(inArray(contentBlobs.hash, chunk));
    for (const row of rows) existing.add(row.hash);
  }
  return existing;
}

export async function createDeploy(input: {
  db: EdgeDb;
  siteId: string;
  manifest: readonly DeployManifestEntry[];
  note?: string;
}) {
  const { db, siteId, manifest, note } = input;
  const { files, versions } = await import("@defs");
  const now = Date.now();
  const deployId = newId();
  await db.insert(versions).values({
    id: deployId,
    siteId,
    parentVersionId: null,
    status: "building",
    note: note ?? null,
    fileCount: manifest.length,
    totalBytes: manifest.reduce((sum, entry) => sum + entry.size, 0),
    createdAt: now,
    committedAt: null,
    expiresAt: now + BUILD_TTL_MS,
  });

  for (const chunk of chunks(manifest, 90)) {
    await runBatch(
      db,
      chunk.map((entry) =>
        db.insert(files).values({
          id: newId(),
          versionId: deployId,
          path: entry.path,
          hash: entry.hash,
          contentType: entry.contentType,
          size: entry.size,
        })
      )
    );
  }

  return { deployId };
}

export async function createUploadMap(input: {
  storage: EdgeStorage;
  siteId: string;
  manifest: readonly DeployManifestEntry[];
  missingHashes: readonly string[];
}) {
  const { buckets } = await import("@defs");
  const bucket = input.storage.from(buckets.siteAssets);
  const byHash = new Map(input.manifest.map((entry) => [entry.hash, entry]));
  const uploads = await Promise.all(
    input.missingHashes.map(async (hash) => {
      const entry = byHash.get(hash);
      if (!entry) throw new Error(`manifest hash not found: ${hash}`);
      const upload = await bucket.createPresignedPutUrl(hostingBlobKey(hash), 900, {
        contentType: entry.contentType,
      });
      return [hash, { uploadUrl: upload.uploadUrl, requiredHeaders: upload.requiredHeaders }] as const;
    })
  );
  return Object.fromEntries(uploads);
}

export async function finalizeDeploy(input: { db: EdgeDb; storage: EdgeStorage; siteId: string; deployId: string }) {
  const { db, storage, siteId, deployId } = input;
  const { buckets, contentBlobs, files, sites, versions } = await import("@defs");
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), sql`${sites.deletedAt} is null`))
    .limit(1);
  if (!site) return { ok: false as const, status: 404, code: "site_not_found" };

  const [version] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.id, deployId), eq(versions.siteId, siteId), eq(versions.status, "building")))
    .limit(1);
  if (!version) return { ok: false as const, status: 404, code: "deploy_not_found" };

  const manifest = await db.select().from(files).where(eq(files.versionId, deployId));
  const bucket = storage.from(buckets.siteAssets);
  const counts = new Map<string, { count: number; r2Key: string; size: number }>();

  for (const entry of manifest) {
    const r2Key = hostingBlobKey(entry.hash);
    const head = await bucket.head(r2Key);
    if (!head) return { ok: false as const, status: 400, code: "missing_blob", path: entry.path };
    if (head.size !== entry.size) return { ok: false as const, status: 400, code: "size_mismatch", path: entry.path };
    const existing = counts.get(entry.hash);
    counts.set(entry.hash, {
      count: (existing?.count ?? 0) + 1,
      r2Key,
      size: entry.size,
    });
  }

  const now = Date.now();
  for (const chunk of chunks([...counts.entries()], 90)) {
    await runBatch(
      db,
      chunk.map(([hash, item]) =>
        db
          .insert(contentBlobs)
          .values({
            hash,
            r2Key: item.r2Key,
            refCount: item.count,
            firstUploadedAt: now,
            lastVerifiedAt: now,
          })
          .onConflictDoUpdate({
            target: contentBlobs.hash,
            set: {
              refCount: sql`${contentBlobs.refCount} + ${item.count}`,
              lastVerifiedAt: now,
            },
          })
      )
    );
  }

  const results = await db.batch([
    db.update(versions).set({ status: "ready", committedAt: now, expiresAt: null }).where(eq(versions.id, deployId)),
    db
      .update(sites)
      .set({ currentVersionId: deployId, lockVersion: site.lockVersion + 1, updatedAt: now })
      .where(and(eq(sites.id, siteId), eq(sites.lockVersion, site.lockVersion), sql`${sites.deletedAt} is null`))
      .returning({ id: sites.id }),
  ]);
  const updated = results[1] as { id: string }[];
  if (updated.length === 0) {
    await rollbackBlobRefCounts(db, counts);
    await db.update(versions).set({ status: "failed" }).where(eq(versions.id, deployId));
    return { ok: false as const, status: 409, code: "deploy_conflict" };
  }

  return { ok: true as const, deployId };
}

/**
 * Extract the raw site path from a file-management URL. Hono's wildcard param
 * (`c.req.param("*")`) is unreliable for `/sites/:id/files/*` in this runtime and returns
 * undefined — which normalizes to "/index.html" and silently rewrites the wrong file — so
 * we slice the path after the unique, site-scoped `/sites/<id>/files/` marker instead.
 */
export function rawFilePathFromUrl(url: string, siteId: string): string {
  const pathname = new URL(url).pathname;
  const marker = `/sites/${siteId}/files/`;
  const i = pathname.indexOf(marker);
  return i === -1 ? "" : pathname.slice(i + marker.length);
}

export async function putSingleFile(input: {
  db: EdgeDb;
  storage: EdgeStorage;
  siteId: string;
  rawPath: string;
  body: ArrayBuffer;
  contentType?: string;
}) {
  if (input.body.byteLength > MAX_SINGLE_FILE_BYTES) {
    return { ok: false as const, status: 413, code: "file_too_large" };
  }
  const path = normalizeSitePath(input.rawPath);
  const hash = await sha256Hex(input.body);
  const contentType = input.contentType || contentTypeFor(path);
  const { buckets } = await import("@defs");
  await input.storage.from(buckets.siteAssets).put(hostingBlobKey(hash), input.body, { contentType });
  return createDeltaVersion({
    db: input.db,
    siteId: input.siteId,
    path,
    hash,
    contentType,
    size: input.body.byteLength,
  });
}

export async function deleteSingleFile(input: { db: EdgeDb; siteId: string; rawPath: string }) {
  return createDeltaVersion({
    db: input.db,
    siteId: input.siteId,
    path: normalizeSitePath(input.rawPath),
    hash: TOMBSTONE_HASH,
    contentType: "application/x-deleted",
    size: 0,
  });
}

async function createDeltaVersion(input: {
  db: EdgeDb;
  siteId: string;
  path: string;
  hash: string;
  contentType: string;
  size: number;
}) {
  const { contentBlobs, files, sites, versions } = await import("@defs");
  const [site] = await input.db
    .select()
    .from(sites)
    .where(and(eq(sites.id, input.siteId), sql`${sites.deletedAt} is null`))
    .limit(1);
  if (!site) return { ok: false as const, status: 404, code: "site_not_found" };
  if (!site.currentVersionId) return { ok: false as const, status: 404, code: "version_not_found" };

  const now = Date.now();
  const versionId = newId();
  const statements: BatchStatement[] = [
    input.db.insert(versions).values({
      id: versionId,
      siteId: input.siteId,
      parentVersionId: site.currentVersionId,
      status: "ready",
      note: null,
      fileCount: 1,
      totalBytes: input.size,
      createdAt: now,
      committedAt: now,
      expiresAt: null,
    }),
    input.db.insert(files).values({
      id: newId(),
      versionId,
      path: input.path,
      hash: input.hash,
      contentType: input.contentType,
      size: input.size,
    }),
  ];

  // Deletions are represented as a file-row tombstone so resolution can stop at
  // the nearest delta without cloning the full manifest.
  if (input.hash !== TOMBSTONE_HASH) {
    statements.push(
      input.db
        .insert(contentBlobs)
        .values({
          hash: input.hash,
          r2Key: hostingBlobKey(input.hash),
          refCount: 1,
          firstUploadedAt: now,
          lastVerifiedAt: now,
        })
        .onConflictDoUpdate({
          target: contentBlobs.hash,
          set: {
            refCount: sql`${contentBlobs.refCount} + 1`,
            lastVerifiedAt: now,
          },
        })
    );
  }

  const results = await input.db.batch([
    ...statements,
    input.db
      .update(sites)
      .set({ currentVersionId: versionId, lockVersion: site.lockVersion + 1, updatedAt: now })
      .where(and(eq(sites.id, input.siteId), eq(sites.lockVersion, site.lockVersion), sql`${sites.deletedAt} is null`))
      .returning({ id: sites.id }),
  ] as unknown as [BatchStatement, ...BatchStatement[]]);
  const updated = results[results.length - 1] as { id: string }[];
  if (updated.length === 0) return { ok: false as const, status: 409, code: "deploy_conflict" };

  return { ok: true as const, versionId, path: input.path, hash: input.hash };
}

function normalizeDeployManifestEntry(entry: RawManifestEntry): DeployManifestEntry {
  if (typeof entry.path !== "string") throw new Error("manifest path must be a string");
  if (typeof entry.hash !== "string" || !HASH_RE.test(entry.hash)) {
    throw new Error("manifest hash must be a lowercase sha256 hex string");
  }
  const size = entry.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new Error("manifest size must be a non-negative integer");
  }
  if (typeof entry.contentType !== "string" || entry.contentType.length === 0 || entry.contentType.length > 255) {
    throw new Error("manifest contentType must be a non-empty string up to 255 characters");
  }
  return {
    path: normalizeSitePath(entry.path),
    hash: entry.hash,
    size,
    contentType: entry.contentType,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runBatch(db: EdgeDb, statements: BatchStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements as [BatchStatement, ...BatchStatement[]]);
}

async function rollbackBlobRefCounts(
  db: EdgeDb,
  counts: ReadonlyMap<string, { count: number }>
): Promise<void> {
  const { contentBlobs } = await import("@defs");
  for (const chunk of chunks([...counts.entries()], 90)) {
    await runBatch(
      db,
      chunk.map(([hash, item]) =>
        db
          .update(contentBlobs)
          .set({ refCount: sql`${contentBlobs.refCount} - ${item.count}` })
          .where(eq(contentBlobs.hash, hash))
      )
    );
  }
}

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
