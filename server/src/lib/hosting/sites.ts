import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { newId } from "../ids";

type EdgeDb = typeof import("edgespark").db;
type EdgeStorage = typeof import("edgespark").storage;
type BatchStatement = Parameters<EdgeDb["batch"]>[0][number];

export type SiteInsertCandidate = {
  id: string;
  slug: string;
  name: string;
  siteKey: string;
  spaMode: number;
  lockVersion: number;
  deletedAt: number | null;
  currentVersionId: string | null;
  createdAt: number;
  updatedAt: number;
};

type InsertSiteOptions = {
  name: string;
  slug?: string;
  spaMode: boolean;
  slugFactory?: (name: string) => string;
  siteKeyFactory?: () => string;
  idFactory?: () => string;
  now?: () => number;
};

const MAX_INSERT_ATTEMPTS = 8;

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomSuffix(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function generateSiteKey(): string {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return `sk_${toBase64Url(raw)}`;
}

export function newSlug(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "site";
  return `${base}-${randomSuffix(6)}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}

export async function insertSiteWithRetry<T>(
  options: InsertSiteOptions,
  insert: (candidate: SiteInsertCandidate) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const now = options.now?.() ?? Date.now();
    const candidate: SiteInsertCandidate = {
      id: options.idFactory?.() ?? newId(),
      slug: options.slug ?? (options.slugFactory ?? newSlug)(options.name),
      name: options.name,
      siteKey: options.siteKeyFactory?.() ?? generateSiteKey(),
      spaMode: options.spaMode ? 1 : 0,
      lockVersion: 0,
      deletedAt: null,
      currentVersionId: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return await insert(candidate);
    } catch (error) {
      if (!isUniqueConstraintError(error) || options.slug) throw error;
    }
  }
  throw new Error("failed-to-generate-unique-site");
}

export async function createSite(
  db: EdgeDb,
  input: { name: string; slug?: string; spaMode: boolean }
) {
  const { sites } = await import("@defs");
  return insertSiteWithRetry(input, async (candidate) => {
    const [row] = await db.insert(sites).values(candidate).returning();
    return row;
  });
}

export async function findActiveSite(db: EdgeDb, id: string) {
  const { sites } = await import("@defs");
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
    .limit(1);
  return site ?? null;
}

export async function hardDeleteSite(input: { db: EdgeDb; storage: EdgeStorage; siteId: string }): Promise<void> {
  try {
    await hardDeleteSiteInner(input);
  } catch (error) {
    console.error("hosting hard-delete failed", { siteId: input.siteId, error });
  }
}

async function hardDeleteSiteInner(input: { db: EdgeDb; storage: EdgeStorage; siteId: string }): Promise<void> {
  const { db, storage, siteId } = input;
  const { baasCollections, baasFiles, baasRecords, buckets, contentBlobs, files, sites, versions } = await import("@defs");
  const versionRows = await db.select({ id: versions.id }).from(versions).where(eq(versions.siteId, siteId));
  const versionIds = versionRows.map((row) => row.id);

  await runBatches(db, [
    db.update(sites).set({ currentVersionId: null }).where(eq(sites.id, siteId)),
    db.delete(baasRecords).where(eq(baasRecords.siteId, siteId)),
    db.delete(baasFiles).where(eq(baasFiles.siteId, siteId)),
    db.delete(baasCollections).where(eq(baasCollections.siteId, siteId)),
  ]);

  for (const ids of chunks(versionIds, 90)) {
    await runBatches(db, [
      db.delete(files).where(inArray(files.versionId, ids)),
      db.delete(versions).where(inArray(versions.id, ids)),
    ]);
  }

  await runBatches(db, [
    db.delete(contentBlobs).where(like(contentBlobs.r2Key, `${siteId}/%`)),
  ]);

  const bucket = storage.from(buckets.siteAssets);
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${siteId}/`, limit: 1000, cursor });
    for (const paths of chunks(
      page.files.map((file) => file.path),
      100
    )) {
      await bucket.delete(paths);
    }
    cursor = page.cursor;
    if (!page.hasMore) break;
  } while (cursor);

  await runBatches(db, [db.delete(sites).where(eq(sites.id, siteId))]);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runBatches(db: EdgeDb, statements: BatchStatement[]): Promise<void> {
  for (const batch of chunks(
    statements.filter((statement) => statement !== undefined),
    90
  )) {
    if (batch.length > 0) await db.batch(batch as [BatchStatement, ...BatchStatement[]]);
  }
}
