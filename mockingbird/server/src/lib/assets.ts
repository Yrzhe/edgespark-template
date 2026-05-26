export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function sanitizeFilename(filename: string): string {
  return filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "upload";
}

export function isImageKind(value: unknown): value is "avatar" | "cover" | "project" | "inline" | "og" {
  return value === "avatar" || value === "cover" || value === "project" || value === "inline" || value === "og";
}

export function isSupportedImageType(value: unknown): value is string {
  return typeof value === "string" && IMAGE_TYPES.has(value);
}
