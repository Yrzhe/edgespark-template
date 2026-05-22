import { and, desc, eq, inArray, like, lt, lte, sql } from "drizzle-orm";

type EdgeDb = typeof import("edgespark").db;
type EdgeStorage = typeof import("edgespark").storage;
type BatchStatement = Parameters<EdgeDb["batch"]>[0][number];

export const RETAINED_VERSIONS = 10;

export async function gcAfterDeploy(input: { db: EdgeDb; storage: EdgeStorage; siteId: string }): Promise<void> {
  const { buckets, contentBlobs, files, versions } = await import("@defs");
  const { db, storage, siteId } = input;
  const now = Date.now();

  await db
    .update(versions)
    .set({ status: "failed" })
    .where(and(eq(versions.siteId, siteId), eq(versions.status, "building"), lt(versions.expiresAt, now)));

  const ready = await db
    .select({ id: versions.id })
    .from(versions)
    .where(and(eq(versions.siteId, siteId), eq(versions.status, "ready")))
    .orderBy(desc(versions.createdAt));
  const oldVersionIds = ready.slice(RETAINED_VERSIONS).map((version) => version.id);
  if (oldVersionIds.length === 0) return;

  for (const versionIds of chunks(oldVersionIds, 90)) {
    const fileRows = await db
      .select({ hash: files.hash })
      .from(files)
      .where(inArray(files.versionId, versionIds));
    const refDeltas = new Map<string, number>();
    for (const row of fileRows) {
      if (row.hash.startsWith("\0")) continue;
      refDeltas.set(row.hash, (refDeltas.get(row.hash) ?? 0) + 1);
    }

    const statements: BatchStatement[] = [];
    for (const [hash, count] of refDeltas) {
      statements.push(
        db
          .update(contentBlobs)
          .set({ refCount: sql`${contentBlobs.refCount} - ${count}` })
          .where(eq(contentBlobs.hash, hash))
      );
    }
    statements.push(db.delete(files).where(inArray(files.versionId, versionIds)));
    statements.push(db.delete(versions).where(inArray(versions.id, versionIds)));
    await runBatch(db, statements);
  }

  const dead = await db
    .select({ hash: contentBlobs.hash, r2Key: contentBlobs.r2Key, refCount: contentBlobs.refCount })
    .from(contentBlobs)
    .where(and(like(contentBlobs.r2Key, `${siteId}/%`), lte(contentBlobs.refCount, 0)));
  const bucket = storage.from(buckets.siteAssets);

  for (const group of chunks(dead, 90)) {
    const fresh = await db
      .select({ hash: contentBlobs.hash, r2Key: contentBlobs.r2Key })
      .from(contentBlobs)
      .where(and(inArray(contentBlobs.hash, group.map((row) => row.hash)), lte(contentBlobs.refCount, 0)));
    if (fresh.length === 0) continue;
    await bucket.delete(fresh.map((row) => row.r2Key));
    await db.delete(contentBlobs).where(inArray(contentBlobs.hash, fresh.map((row) => row.hash)));
  }
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
