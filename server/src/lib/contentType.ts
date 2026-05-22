/**
 * Extension → content-type allowlist for served hosted files. The Worker sets the
 * content-type from this map (never trusting stored headers) and serves not-inline-safe
 * types (SVG) as attachment / sandboxed.
 */

const MAP: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  map: "application/json; charset=utf-8",
  wasm: "application/wasm",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
};

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MAP[path.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

// SVG can execute script when rendered inline; serve it as attachment or sandboxed.
const NOT_INLINE = new Set(["image/svg+xml"]);
export function isInlineSafe(contentType: string): boolean {
  return !NOT_INLINE.has(contentType);
}
