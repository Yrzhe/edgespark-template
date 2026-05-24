import { describe, expect, it } from "vitest";

// TODO(scaffold): convert to route integration coverage for
// `POST /pages/:pageId/assets/confirm` and link thumbnail confirm once storage
// SDK mocks are available from the generated Perch scaffold.

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

describe("asset confirm contract", () => {
  it("accepts uploaded image objects with allowed content type and size", async () => {
    const deleted: string[] = [];
    const result = await confirmUploadedKey("pages/p1/avatars/a/avatar.jpg", {
      size: 200_000,
      contentType: "image/webp",
      delete: async (path) => deleted.push(path),
    });

    expect(result).toEqual({ ok: true, path: "pages/p1/avatars/a/avatar.jpg" });
    expect(deleted).toEqual([]);
  });

  it("rejects and deletes uploaded objects whose final content type is not an image", async () => {
    const deleted: string[] = [];
    const result = await confirmUploadedKey("pages/p1/avatars/a/payload.html", {
      size: 100,
      contentType: "text/html",
      delete: async (path) => deleted.push(path),
    });

    expect(result).toEqual({ ok: false, status: 415, code: "invalid_content_type" });
    expect(deleted).toEqual(["pages/p1/avatars/a/payload.html"]);
  });
});

async function confirmUploadedKey(
  path: string,
  meta: { size: number; contentType?: string; delete: (path: string) => Promise<void> }
) {
  if (!meta.contentType || !IMAGE_TYPES.has(meta.contentType)) {
    await meta.delete(path);
    return { ok: false as const, status: 415, code: "invalid_content_type" };
  }
  if (meta.size > 5 * 1024 * 1024) {
    await meta.delete(path);
    return { ok: false as const, status: 413, code: "file_too_large" };
  }
  return { ok: true as const, path };
}
