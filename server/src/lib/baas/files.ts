export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function sanitizeFilename(input: string): string {
  const stripped = input
    .replace(/[\\/]+/g, "-")
    .replace(/\0/g, "")
    .trim()
    .slice(0, 255);
  return stripped.length > 0 ? stripped : "file";
}

export function makeUploadKey(siteId: string, fileId: string, filename: string): string {
  return `${siteId}/${fileId}/${sanitizeFilename(filename)}`;
}
