import { and, count, eq, gt } from "drizzle-orm";
import { baasRecords } from "../../defs";

type EdgeDb = typeof import("edgespark").db;

export const DEFAULT_RATE_LIMIT = {
  windowMs: 60_000,
  max: 60,
};

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getClientIp(headers: Headers): string {
  const cf = headers.get("CF-Connecting-IP");
  if (cf?.trim()) return cf.trim();
  const forwarded = headers.get("X-Forwarded-For");
  if (forwarded?.trim()) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return toHex(new Uint8Array(digest));
}

export async function checkRecordRateLimit(
  db: EdgeDb,
  input: {
    siteId: string;
    collection: string;
    sourceIpHash: string;
    now?: number;
    windowMs?: number;
    max?: number;
  }
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? DEFAULT_RATE_LIMIT.windowMs;
  const max = input.max ?? DEFAULT_RATE_LIMIT.max;
  const [row] = await db
    .select({ value: count() })
    .from(baasRecords)
    .where(
      and(
        eq(baasRecords.siteId, input.siteId),
        eq(baasRecords.collection, input.collection),
        eq(baasRecords.sourceIpHash, input.sourceIpHash),
        gt(baasRecords.createdAt, now - windowMs)
      )
    );

  // D1 count is enough for v1; a KV/DO counter would reduce write-path query load later.
  if ((row?.value ?? 0) >= max) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
  return { allowed: true };
}
