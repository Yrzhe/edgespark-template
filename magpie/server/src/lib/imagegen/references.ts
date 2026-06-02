import { db as edgeDb, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { assets } from "@defs";

export const MAX_REFERENCE_ASSETS = 3;

export interface ImageReference {
  assetId: string;
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}

export class ReferenceAssetError extends Error {
  status: 400 | 403 | 404;
  code: string;

  constructor(status: 400 | 403 | 404, code: string, message = code) {
    super(message);
    this.name = "ReferenceAssetError";
    this.status = status;
    this.code = code;
  }
}

export function parseReferenceAssetIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new ReferenceAssetError(400, "invalid_reference_asset_ids", "referenceAssetIds must be an array of 1 to 3 asset ids.");
  if (value.length < 1) throw new ReferenceAssetError(400, "invalid_reference_asset_ids", "referenceAssetIds must include at least one asset id when provided.");
  if (value.length > MAX_REFERENCE_ASSETS) throw new ReferenceAssetError(400, "reference_asset_limit_exceeded", `referenceAssetIds supports at most ${MAX_REFERENCE_ASSETS} assets.`);
  const ids = value.map((id) => typeof id === "string" ? id.trim() : "");
  if (ids.some((id) => id.length === 0)) throw new ReferenceAssetError(400, "invalid_reference_asset_ids", "referenceAssetIds must contain only non-empty strings.");
  if (new Set(ids).size !== ids.length) throw new ReferenceAssetError(400, "duplicate_reference_asset_id", "referenceAssetIds must not contain duplicates.");
  return ids;
}

export async function resolveReferenceAssets(userId: string, referenceAssetIds: string[] | null | undefined, database: any = edgeDb): Promise<ImageReference[]> {
  if (!referenceAssetIds?.length) return [];
  const resolved: ImageReference[] = [];
  for (const assetId of referenceAssetIds) {
    const [row] = await database.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!row || row.deletedAt) throw new ReferenceAssetError(404, "reference_asset_not_found", "Reference asset not found.");
    if (row.ownerUserId !== userId) throw new ReferenceAssetError(403, "reference_asset_forbidden", "Reference asset does not belong to the caller.");
    if (!assetIsReady(row)) throw new ReferenceAssetError(400, "reference_asset_not_ready", "Reference asset must be status=ready.");

    const parsed = storage.tryParseS3Uri(row.s3Uri);
    if (!parsed) throw new ReferenceAssetError(404, "reference_asset_not_fetchable", "Reference asset bytes are not fetchable.");
    const object = await storage.from(parsed.bucket).get(parsed.path);
    if (!object) throw new ReferenceAssetError(404, "reference_asset_bytes_missing", "Reference asset bytes are missing.");

    const contentType = normalizeContentType(row.contentType || object.metadata?.contentType || "application/octet-stream");
    if (!isSupportedReferenceType(contentType)) throw new ReferenceAssetError(400, "reference_asset_unsupported_type", "Reference asset must be a PNG, JPEG, or WebP image.");
    const bytes = await bodyToBytes(object.body);
    if (bytes.byteLength === 0) throw new ReferenceAssetError(400, "reference_asset_empty", "Reference asset bytes are empty.");
    resolved.push({ assetId, filename: `${safeFileStem(assetId)}.${extensionForContentType(contentType)}`, bytes, contentType });
  }
  return resolved;
}

function assetIsReady(row: any): boolean {
  return !row.status || row.status === "ready";
}

function normalizeContentType(value: string): string {
  return value.toLowerCase().split(";")[0].trim();
}

function isSupportedReferenceType(contentType: string): boolean {
  return contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/jpg" || contentType === "image/webp";
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "png";
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "reference";
}

async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) return new Uint8Array(await new Response(body).arrayBuffer());
  const maybeArrayBuffer = body as { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof maybeArrayBuffer?.arrayBuffer === "function") return new Uint8Array(await maybeArrayBuffer.arrayBuffer());
  throw new ReferenceAssetError(404, "reference_asset_bytes_missing", "Reference asset bytes are missing.");
}
