export const TOMBSTONE_HASH = "\0deleted";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { contentTypeFor, isInlineSafe } from "../contentType";
import { normalizeSitePath } from "../pathNormalize";

type EdgeDb = typeof import("edgespark").db;
type EdgeStorage = typeof import("edgespark").storage;

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

type VersionLink = {
  id: string;
  parentVersionId: string | null;
};

type FileLink = {
  versionId: string;
  path: string;
  hash: string;
};

export function resolveVersionPath(input: {
  versions: readonly VersionLink[];
  files: readonly FileLink[];
  currentVersionId: string | null;
  path: string;
}): { hash: string; versionId: string } | null {
  const versionsById = new Map(input.versions.map((version) => [version.id, version]));
  const filesByVersionPath = new Map(input.files.map((file) => [`${file.versionId}:${file.path}`, file]));

  let cursor = input.currentVersionId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const file = filesByVersionPath.get(`${cursor}:${input.path}`);
    if (file) {
      if (file.hash === TOMBSTONE_HASH) return null;
      return { hash: file.hash, versionId: cursor };
    }
    cursor = versionsById.get(cursor)?.parentVersionId ?? null;
  }

  return null;
}

export async function serveSiteFile(input: {
  db: EdgeDb;
  storage: EdgeStorage;
  request: Request;
  slug: string;
  rawPath: string;
}): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default: CacheLike } }).caches?.default;
  const cached = await cache?.match(input.request);
  if (cached) return cached;

  const { buckets, files, sites, versions } = await import("@defs");
  const [site] = await input.db
    .select()
    .from(sites)
    .where(and(eq(sites.slug, input.slug), isNull(sites.deletedAt)))
    .limit(1);
  if (!site || !site.currentVersionId) return notFound();

  let path: string;
  try {
    path = normalizeSitePath(input.rawPath);
  } catch {
    return notFound();
  }

  const versionRows = await input.db.select().from(versions).where(eq(versions.siteId, site.id));
  const versionIds = versionRows.map((version) => version.id);
  const fileRows =
    versionIds.length > 0 ? await input.db.select().from(files).where(inArray(files.versionId, versionIds)) : [];

  let resolved = resolveVersionPath({ versions: versionRows, files: fileRows, currentVersionId: site.currentVersionId, path });
  let servedPath = path;
  if (!resolved && site.spaMode === 1) {
    servedPath = "/index.html";
    resolved = resolveVersionPath({ versions: versionRows, files: fileRows, currentVersionId: site.currentVersionId, path: servedPath });
  }
  if (!resolved) {
    servedPath = "/404.html";
    resolved = resolveVersionPath({ versions: versionRows, files: fileRows, currentVersionId: site.currentVersionId, path: servedPath });
  }
  if (!resolved) return notFound();

  const obj = await input.storage.from(buckets.siteAssets).get(`${site.id}/${resolved.hash}`);
  if (!obj) return notFound();

  const headers = headersForServedPath(servedPath);
  const response = new Response(obj.body, { headers });
  await cache?.put(input.request, response.clone());
  return response;
}

export function headersForServedPath(path: string): Headers {
  const contentType = contentTypeFor(path);
  const headers = new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": contentType.startsWith("text/html")
      ? "public, max-age=60"
      : "public, max-age=31536000, immutable",
  });
  if (contentType.startsWith("text/html")) {
    headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'");
  }
  if (!isInlineSafe(contentType)) {
    headers.set("Content-Disposition", "attachment");
  }
  return headers;
}

export function rawServePathFromUrl(url: string, slug: string): string {
  const prefix = `/api/public/s/${slug}/`;
  const pathname = new URL(url).pathname;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
