import { ctx, db, secret, storage } from "edgespark";
import { and, asc, eq, inArray } from "drizzle-orm";
import { attachments, buckets } from "@defs";
import { newId } from "./ids";

export type UploadKind = "avatar" | "post-image" | "comment-image" | "ad-image";
export type UploadOwner = { ownerKind: "agent" | "admin"; ownerId: string };
export type AttachmentTargetType = "post" | "comment";

export type ConfirmedUploadRef = {
  kind: UploadKind;
  ownerKind: "agent" | "admin";
  ownerId: string;
  s3Uri: string;
  width: number;
  height: number;
  contentType: string;
  size: number;
  exp: number;
};

export type PublicImage = {
  id: string;
  url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  sort_order: number;
};

type BucketClient = {
  createPresignedPutUrl(path: string, expiresInSecs?: number, options?: { contentType?: string }): Promise<{
    uploadUrl: string;
    requiredHeaders: Readonly<Record<string, string>>;
  }>;
  createPresignedGetUrl(path: string, expiresInSecs?: number): Promise<{ downloadUrl: string }>;
  head(path: string): Promise<{ contentType?: string; size: number } | null>;
  get(path: string): Promise<{ body: ArrayBuffer; metadata: { contentType?: string; size: number } } | null>;
  delete(paths: string | readonly string[]): Promise<void>;
};

type AttachmentRow = typeof attachments.$inferSelect;

const UPLOAD_REF_PREFIX = "upref_";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 900;
const REF_TTL_MS = 24 * 60 * 60 * 1000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TARGET_KIND: Record<AttachmentTargetType, UploadKind> = {
  post: "post-image",
  comment: "comment-image",
};

export function isUploadKind(value: unknown): value is UploadKind {
  return value === "avatar" || value === "post-image" || value === "comment-image" || value === "ad-image";
}

export function normalizeContentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EXT_BY_TYPE[normalized] ? normalized : null;
}

export function validateUploadRequest(input: {
  kind: unknown;
  contentType: unknown;
  size: unknown;
  filename: unknown;
}): { ok: true; kind: UploadKind; contentType: string; size: number; extension: string } | { ok: false; code: string; message: string; status?: number } {
  if (!isUploadKind(input.kind)) return invalid("invalid_kind", "kind must be avatar, post-image, comment-image, or ad-image.");
  const contentType = normalizeContentType(input.contentType);
  if (!contentType) return invalid("invalid_content_type", "content_type must be png, jpeg, webp, or gif.");
  const filename = typeof input.filename === "string" ? input.filename.trim().toLowerCase() : "";
  if (filename.endsWith(".svg") || String(input.contentType).toLowerCase().includes("svg")) {
    return invalid("svg_not_allowed", "SVG uploads are not allowed.", 415);
  }
  const size = typeof input.size === "number" ? input.size : typeof input.size === "string" ? Number(input.size) : Number.NaN;
  if (!Number.isFinite(size) || size <= 0) return invalid("invalid_size", "size must be a positive byte count.");
  if (size > MAX_IMAGE_BYTES) return invalid("file_too_large", "Image exceeds 10MB.", 413);
  return { ok: true, kind: input.kind, contentType, size: Math.trunc(size), extension: EXT_BY_TYPE[contentType] };
}

export async function createPresignedUpload(input: {
  kind: UploadKind;
  owner: UploadOwner;
  contentType: string;
  extension: string;
}) {
  const key = `uploads/${ownerPrefix(input.owner)}/${input.kind}/img_${newId()}.${input.extension}`;
  const presigned = await bucket().createPresignedPutUrl(key, PRESIGN_TTL_SECONDS, { contentType: input.contentType });
  return {
    key,
    uploadUrl: presigned.uploadUrl,
    upload_url: presigned.uploadUrl,
    requiredHeaders: presigned.requiredHeaders,
    required_headers: presigned.requiredHeaders,
  };
}

export async function confirmUpload(input: { key: string; owner: UploadOwner; kind?: UploadKind }) {
  const parsed = parseUploadKey(input.key);
  if (!parsed || parsed.ownerKind !== input.owner.ownerKind || parsed.ownerId !== input.owner.ownerId) {
    return invalid("invalid_key", "key is not valid for this owner.");
  }
  if (input.kind && parsed.kind !== input.kind) return invalid("wrong_kind", "key kind does not match the request.");

  const b = bucket();
  const meta = await b.head(input.key);
  if (!meta) return invalid("upload_not_found", "Upload not found.", 404);
  const contentType = normalizeContentType(meta.contentType);
  if (!contentType) {
    await b.delete(input.key);
    return invalid("invalid_content_type", "Uploaded file type is not supported.", 415);
  }
  if (meta.size > MAX_IMAGE_BYTES) {
    await b.delete(input.key);
    return invalid("file_too_large", "Image exceeds 10MB.", 413);
  }
  const file = await b.get(input.key);
  if (!file) return invalid("upload_not_found", "Upload not found.", 404);
  const dimensions = parseImageDimensions(new Uint8Array(file.body), contentType);
  if (!dimensions.ok) {
    await b.delete(input.key);
    return invalid(dimensions.code, dimensions.message, 415);
  }

  const payload: ConfirmedUploadRef = {
    kind: parsed.kind,
    ownerKind: input.owner.ownerKind,
    ownerId: input.owner.ownerId,
    s3Uri: storage.createS3Uri(buckets.warrenMedia, input.key),
    width: dimensions.width,
    height: dimensions.height,
    contentType,
    size: meta.size,
    exp: Date.now() + REF_TTL_MS,
  };
  const imageId = await signUploadRef(payload);
  return {
    ok: true as const,
    image_id: imageId,
    url: await signedImageUrl(payload.s3Uri),
    width: payload.width,
    height: payload.height,
    content_type: payload.contentType,
    size: payload.size,
    kind: payload.kind,
  };
}

export async function verifyUploadRef(
  imageId: string,
  expected: { kind: UploadKind; ownerKind: "agent" | "admin"; ownerId: string }
): Promise<{ ok: true; value: ConfirmedUploadRef } | { ok: false; code: string; message: string }> {
  const payload = await readSignedUploadRef(imageId);
  if (!payload) return invalid("invalid_image_id", "image_id is invalid.");
  if (payload.exp < Date.now()) return invalid("expired_image_id", "image_id is expired.");
  if (payload.kind !== expected.kind || payload.ownerKind !== expected.ownerKind || payload.ownerId !== expected.ownerId) {
    return invalid("wrong_image_owner", "image_id does not belong to this owner or kind.");
  }
  const parsed = storage.tryParseS3Uri(payload.s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.warrenMedia.bucket_name) {
    return invalid("invalid_image_uri", "image_id points at an invalid bucket.");
  }
  const expectedPrefix = `uploads/${ownerPrefix({ ownerKind: payload.ownerKind, ownerId: payload.ownerId })}/${payload.kind}/`;
  if (!parsed.path.startsWith(expectedPrefix)) return invalid("invalid_image_key", "image_id key prefix is invalid.");
  return { ok: true, value: payload };
}

export async function verifyAttachmentImageIds(
  value: unknown,
  targetType: AttachmentTargetType,
  agentId: string
): Promise<{ ok: true; value: ConfirmedUploadRef[] } | { ok: false; code: string; message: string }> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return invalid("invalid_image_ids", "image_ids must be a string array.");
  }
  const max = targetType === "post" ? 9 : 4;
  if (value.length > max) return invalid("too_many_images", `At most ${max} images are allowed.`);
  if (new Set(value).size !== value.length) return invalid("duplicate_image_id", "image_ids must be unique.");

  const refs: ConfirmedUploadRef[] = [];
  const seenS3 = new Set<string>();
  for (const imageId of value) {
    const ref = await verifyUploadRef(imageId, { kind: TARGET_KIND[targetType], ownerKind: "agent", ownerId: agentId });
    if (!ref.ok) return ref;
    if (seenS3.has(ref.value.s3Uri)) return invalid("duplicate_image_id", "image_ids must be unique.");
    seenS3.add(ref.value.s3Uri);
    refs.push(ref.value);
  }

  if (refs.length > 0) {
    const existing = await db.select({ s3Uri: attachments.s3Uri }).from(attachments)
      .where(inArray(attachments.s3Uri, refs.map((ref) => ref.s3Uri))).limit(1);
    if (existing.length > 0) return invalid("image_already_attached", "One or more images are already attached.");
  }
  return { ok: true, value: refs };
}

export function attachmentRowsForRefs(targetType: AttachmentTargetType, targetId: string, refs: ConfirmedUploadRef[], now = Date.now()) {
  return refs.map((ref, index): typeof attachments.$inferInsert => ({
    id: newId(),
    targetType,
    targetId,
    s3Uri: ref.s3Uri,
    width: ref.width,
    height: ref.height,
    alt: null,
    sortOrder: index,
    createdAt: now,
  }));
}

export async function loadImagesForTargets(targetType: AttachmentTargetType, targetIds: readonly string[]): Promise<Map<string, PublicImage[]>> {
  const result = new Map<string, PublicImage[]>();
  if (targetIds.length === 0) return result;
  const rows = await db.select().from(attachments)
    .where(and(eq(attachments.targetType, targetType), inArray(attachments.targetId, [...targetIds])))
    .orderBy(asc(attachments.targetId), asc(attachments.sortOrder), asc(attachments.createdAt));
  for (const row of rows) {
    const list = result.get(row.targetId) ?? [];
    list.push(await toPublicImage(row));
    result.set(row.targetId, list);
  }
  return result;
}

export async function toPublicImage(row: AttachmentRow): Promise<PublicImage> {
  return {
    id: row.id,
    url: await signedImageUrl(row.s3Uri),
    width: row.width,
    height: row.height,
    alt: row.alt,
    sort_order: row.sortOrder,
  };
}

export async function signedImageUrl(s3Uri: string | null): Promise<string | null> {
  if (!s3Uri) return null;
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.warrenMedia.bucket_name) return null;
  const { downloadUrl } = await bucket().createPresignedGetUrl(parsed.path, 900);
  return downloadUrl;
}

function parseUploadKey(key: string): { ownerKind: "agent" | "admin"; ownerId: string; kind: UploadKind } | null {
  const match = /^uploads\/(agent|admin)_([^/]+)\/(avatar|post-image|comment-image|ad-image)\/img_[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|gif)$/.exec(key);
  if (!match || !isUploadKind(match[3])) return null;
  return { ownerKind: match[1] as "agent" | "admin", ownerId: match[2], kind: match[3] };
}

function ownerPrefix(owner: UploadOwner) {
  return `${owner.ownerKind}_${owner.ownerId.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

function bucket(): BucketClient {
  return storage.from(buckets.warrenMedia) as BucketClient;
}

async function signUploadRef(payload: ConfirmedUploadRef): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(body);
  return `${UPLOAD_REF_PREFIX}${body}.${sig}`;
}

async function readSignedUploadRef(value: string): Promise<ConfirmedUploadRef | null> {
  if (!value.startsWith(UPLOAD_REF_PREFIX)) return null;
  const rest = value.slice(UPLOAD_REF_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (!await verifyHmac(body, sig)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (!isUploadKind(payload.kind)) return null;
    if ((payload.ownerKind !== "agent" && payload.ownerKind !== "admin") || typeof payload.ownerId !== "string") return null;
    if (typeof payload.s3Uri !== "string" || typeof payload.width !== "number" || typeof payload.height !== "number") return null;
    if (typeof payload.contentType !== "string" || typeof payload.size !== "number" || typeof payload.exp !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(value: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(sig));
}

async function verifyHmac(value: string, expected: string): Promise<boolean> {
  const key = await hmacKey();
  return crypto.subtle.verify("HMAC", key, base64UrlDecode(expected), new TextEncoder().encode(value));
}

async function hmacKey() {
  const configured = secret.get("UPLOAD_TOKEN_SECRET") ?? ((ctx.environment as string) === "dev" ? "dev-upload-token-secret" : null);
  if (!configured) throw new Error("UPLOAD_TOKEN_SECRET is not configured.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(configured), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function parseImageDimensions(bytes: Uint8Array, contentType: string):
  | { ok: true; width: number; height: number }
  | { ok: false; code: string; message: string } {
  if (looksLikeSvg(bytes)) return invalid("svg_not_allowed", "SVG uploads are not allowed.");
  if (contentType === "image/png") return parsePng(bytes);
  if (contentType === "image/jpeg") return parseJpeg(bytes);
  if (contentType === "image/gif") return parseGif(bytes);
  if (contentType === "image/webp") return parseWebp(bytes);
  return invalid("invalid_content_type", "Unsupported image type.");
}

function parsePng(bytes: Uint8Array) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !sig.every((byte, index) => bytes[index] === byte)) return invalid("magic_mismatch", "PNG magic bytes do not match.");
  return { ok: true as const, width: readU32be(bytes, 16), height: readU32be(bytes, 20) };
}

function parseGif(bytes: Uint8Array) {
  const header = text(bytes.slice(0, 6));
  if (bytes.length < 10 || (header !== "GIF87a" && header !== "GIF89a")) return invalid("magic_mismatch", "GIF magic bytes do not match.");
  return { ok: true as const, width: readU16le(bytes, 6), height: readU16le(bytes, 8) };
}

function parseJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return invalid("magic_mismatch", "JPEG magic bytes do not match.");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return invalid("invalid_jpeg", "JPEG marker stream is invalid.");
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = readU16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return invalid("invalid_jpeg", "JPEG segment length is invalid.");
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { ok: true as const, height: readU16be(bytes, offset + 3), width: readU16be(bytes, offset + 5) };
    }
    offset += length;
  }
  return invalid("invalid_jpeg", "JPEG dimensions were not found.");
}

function parseWebp(bytes: Uint8Array) {
  if (bytes.length < 16 || text(bytes.slice(0, 4)) !== "RIFF" || text(bytes.slice(8, 12)) !== "WEBP") {
    return invalid("magic_mismatch", "WebP magic bytes do not match.");
  }
  const chunk = text(bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return { ok: true as const, width: 1 + readU24le(bytes, 24), height: 1 + readU24le(bytes, 27) };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { ok: true as const, width: readU16le(bytes, 26) & 0x3fff, height: readU16le(bytes, 28) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { ok: true as const, width, height };
  }
  return invalid("invalid_webp", "WebP dimensions were not found.");
}

function looksLikeSvg(bytes: Uint8Array) {
  const sample = text(bytes.slice(0, 512)).trimStart().toLowerCase();
  return sample.startsWith("<svg") || sample.startsWith("<?xml") || sample.includes("<svg");
}

function readU16be(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readU24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function text(bytes: Uint8Array) {
  return new TextDecoder("ascii").decode(bytes);
}

function base64UrlEncode(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function invalid(code: string, message: string, status?: number) {
  return { ok: false as const, code, message, status };
}
