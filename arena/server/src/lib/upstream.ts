import { eq } from "drizzle-orm";
import { upstreamCache } from "@defs";

export type UpstreamResource = "agents" | "snapshots" | "agent/decisions" | `agents/${string}`;
export const UPSTREAM_TTL_MS = 45_000;
export const UPSTREAM_FETCH_TIMEOUT_MS = 22_000;

export async function fetchUpstream<T>(resource: UpstreamResource, upstreamBaseUrl: string, now = Date.now()): Promise<T | null> {
  const validation = validateUpstreamBaseUrl(upstreamBaseUrl);
  if (!validation.ok) return null;
  const cacheResource = upstreamCacheKey(validation.url, resource);
  const { db, ctx } = await import("edgespark");
  const [cached] = await db.select().from(upstreamCache).where(eq(upstreamCache.resource, cacheResource)).limit(1);
  return fetchUpstreamWithDeps<T>({
    resource,
    upstreamBaseUrl: validation.url,
    now,
    cached,
    fetchJson: async (url, signal) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`upstream ${resource} HTTP ${res.status}`);
      return (await res.json()) as T;
    },
    save: async (payload, fetchedAt) => {
      const json = JSON.stringify(payload);
      await db
        .insert(upstreamCache)
        .values({ resource: cacheResource, payload: json, fetchedAt })
        .onConflictDoUpdate({
          target: upstreamCache.resource,
          set: { payload: json, fetchedAt },
        });
    },
    runInBackground: (promise) => ctx.runInBackground(promise),
  });
}

export async function fetchUpstreamWithDeps<T>(deps: {
  resource: UpstreamResource;
  upstreamBaseUrl: string;
  now: number;
  cached?: { payload: string; fetchedAt: number } | null;
  fetchJson: (url: string, signal: AbortSignal) => Promise<T>;
  save: (payload: T, fetchedAt: number) => Promise<void>;
  runInBackground?: (promise: Promise<unknown>) => void;
}): Promise<T | null> {
  const validation = validateUpstreamBaseUrl(deps.upstreamBaseUrl);
  if (!validation.ok) return null;
  const cached = deps.cached;
  if (cached && deps.now - cached.fetchedAt < UPSTREAM_TTL_MS) return safeJson<T>(cached.payload, null);
  if (cached) {
    const stale = safeJson<T>(cached.payload, null);
    const refresh = refreshUpstream(deps, validation.url);
    if (deps.runInBackground) deps.runInBackground(refresh);
    else void refresh;
    return stale;
  }

  return refreshUpstream(deps, validation.url);
}

async function refreshUpstream<T>(
  deps: {
    resource: UpstreamResource;
    now: number;
    fetchJson: (url: string, signal: AbortSignal) => Promise<T>;
    save: (payload: T, fetchedAt: number) => Promise<void>;
  },
  normalizedBaseUrl: string
): Promise<T | null> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_FETCH_TIMEOUT_MS);
  try {
    const payload = await deps.fetchJson(`${normalizedBaseUrl}/${deps.resource}`, controller.signal);
    await deps.save(payload, deps.now);
    console.info(`[upstream] ${deps.resource} ok ${Date.now() - startedAt}ms`);
    return payload;
  } catch (error) {
    const err = error as { name?: string; message?: string } | null | undefined;
    console.error(`[upstream] ${deps.resource} FAIL ${Date.now() - startedAt}ms ${err?.name ?? ""} ${err?.message ?? ""}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function numberish(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function upstreamCacheKey(normalizedBaseUrl: string, resource: UpstreamResource): string {
  return `${normalizedBaseUrl}::${resource}`;
}

export function validateUpstreamBaseUrl(input: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "invalid_protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials_not_allowed" };
  if (url.hash) return { ok: false, reason: "fragment_not_allowed" };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "private_host_not_allowed" };
  const pathname = url.pathname.replace(/\/+$/, "");
  const normalizedPath = pathname === "/" ? "" : pathname;
  return { ok: true, url: `${url.protocol}//${url.host}${normalizedPath}` };
}

function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".localdomain") || host.endsWith(".lan") || host.endsWith(".home") || host.endsWith(".internal")) return true;
  if (isBlockedIpv4(host)) return true;
  if (isBlockedIpv6(host)) return true;
  return false;
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d+$/.test(part))) return false;
  const nums = parts.map((part) => Number(part));
  if (!nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return true;
  const [a, b, c, d] = nums;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  const normalized = host.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (mapped.includes(".") && isBlockedIpv4(mapped)) return true;
    const words = mapped.split(":").map((part) => Number.parseInt(part || "0", 16));
    if (words.length === 2 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)) {
      const ipv4 = `${words[0] >> 8}.${words[0] & 0xff}.${words[1] >> 8}.${words[1] & 0xff}`;
      if (isBlockedIpv4(ipv4)) return true;
    }
  }
  if (normalized === "::" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (normalized.startsWith("fe80:")) return true;
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  return false;
}

function safeJson<T>(raw: string, fallback: T | null): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
