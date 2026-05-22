import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { baasCollections, baasRecords, sites } from "../../defs";
import type { ReadRule, WriteRule } from "./rules";

type EdgeDb = typeof import("edgespark").db;

export type CollectionRules = {
  id: string;
  siteId: string;
  name: string;
  read: ReadRule;
  write: WriteRule;
  maxRecords: number | null;
  maxBytes: number;
};

export type RecordCursor = {
  createdAt: number;
  id: string;
};

export const DEFAULT_RECORD_LIMIT = 50;
export const MAX_RECORD_LIMIT = 100;
export const DEFAULT_MAX_BYTES = 10240;

export function encodeRecordCursor(cursor: RecordCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRecordCursor(value: string | null | undefined): RecordCursor | null {
  if (!value) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as Partial<RecordCursor>;
    if (typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) return null;
    if (typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function parseLimit(value: string | null | undefined): number {
  if (!value) return DEFAULT_RECORD_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_RECORD_LIMIT;
  return Math.min(parsed, MAX_RECORD_LIMIT);
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringifyRecordData(value: unknown, maxBytes: number): { ok: true; json: string } | { ok: false } {
  if (!isJsonObject(value)) return { ok: false };
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).length > maxBytes) return { ok: false };
  return { ok: true, json };
}

export async function loadActiveSite(db: EdgeDb, siteId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
    .limit(1);
  return site ?? null;
}

export async function loadCollectionRules(db: EdgeDb, siteId: string, name: string): Promise<CollectionRules | null> {
  const [row] = await db
    .select()
    .from(baasCollections)
    .where(and(eq(baasCollections.siteId, siteId), eq(baasCollections.name, name)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    read: row.read as ReadRule,
    write: row.write as WriteRule,
    maxRecords: row.maxRecords,
    maxBytes: row.maxBytes ?? DEFAULT_MAX_BYTES,
  };
}

export function recordKeysetWhere(siteId: string, collection: string, cursor: RecordCursor | null) {
  const scope = and(eq(baasRecords.siteId, siteId), eq(baasRecords.collection, collection));
  if (!cursor) return scope;
  return and(
    scope,
    or(lt(baasRecords.createdAt, cursor.createdAt), and(eq(baasRecords.createdAt, cursor.createdAt), lt(baasRecords.id, cursor.id)))
  );
}

export async function listRecords(db: EdgeDb, siteId: string, collection: string, cursor: RecordCursor | null, limit: number) {
  const rows = await db
    .select()
    .from(baasRecords)
    .where(recordKeysetWhere(siteId, collection, cursor))
    .orderBy(desc(baasRecords.createdAt), desc(baasRecords.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    records: page.map(formatRecord),
    nextCursor: rows.length > limit && page.length > 0 ? encodeRecordCursor(page[page.length - 1]) : null,
  };
}

export function formatRecord(row: typeof baasRecords.$inferSelect) {
  return {
    id: row.id,
    data: JSON.parse(row.data) as unknown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
