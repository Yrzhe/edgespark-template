import { db, storage } from "edgespark";
import { assets, buckets } from "@defs";
import { MEDIA_PREFIX } from "../imagegen/store";

export interface GcResult {
  scanned: number;
  referenced: number;
  orphans: string[];
  deleted: number;
  dryRun: boolean;
}

// Default safety grace: never delete an object younger than this. Protects an in-flight async
// generation whose bytes are written before (or racing) its asset row's status flip.
const DEFAULT_GRACE_MS = 10 * 60 * 1000;
const MAX_LIST_PAGES = 50; // 50 * 1000 = 50k objects ceiling — far above any real magpie-media size.

// Garbage-collect orphaned R2 objects under the agent-gen media prefix: every object whose key
// is not referenced by any assets row (M-213). Owner-only at the route layer. Set dryRun to
// preview without deleting.
export async function gcOrphanMedia(options: { dryRun?: boolean; graceMs?: number; now?: number } = {}): Promise<GcResult> {
  const dryRun = options.dryRun === true;
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const now = options.now ?? Date.now();

  const referenced = await referencedKeys();
  const bucket = storage.from(buckets.magpieMedia);

  const listed: { path: string; uploadedAt: number }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await bucket.list({ prefix: `${MEDIA_PREFIX}/`, limit: 1000, cursor });
    for (const file of result.files) {
      listed.push({ path: file.path, uploadedAt: toEpochMs(file.uploadedAt) });
    }
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }

  const orphans = listed
    .filter((file) => !referenced.has(file.path))
    .filter((file) => now - file.uploadedAt >= graceMs)
    .map((file) => file.path);

  if (!dryRun && orphans.length > 0) await bucket.delete(orphans);

  return { scanned: listed.length, referenced: referenced.size, orphans, deleted: dryRun ? 0 : orphans.length, dryRun };
}

// Every R2 key currently referenced by an asset row (including soft-deleted-but-not-yet-purged
// and in-flight status="generating" rows, whose s3_uri is pre-set to the planned key).
async function referencedKeys(): Promise<Set<string>> {
  const rows = await db.select().from(assets);
  const keys = new Set<string>();
  for (const row of rows as Array<{ s3Uri?: string }>) {
    const parsed = row.s3Uri ? storage.tryParseS3Uri(row.s3Uri) : null;
    if (parsed && parsed.bucket?.bucket_name === buckets.magpieMedia.bucket_name) keys.add(parsed.path);
  }
  return keys;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
