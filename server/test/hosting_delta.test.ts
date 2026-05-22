import { describe, expect, it } from "vitest";
import { TOMBSTONE_HASH, headersForServedPath, rawServePathFromUrl, resolveVersionPath } from "../src/lib/hosting/serve";

describe("hosting delta resolution", () => {
  const versions = [
    { id: "v1", parentVersionId: null },
    { id: "v2", parentVersionId: "v1" },
    { id: "v3", parentVersionId: "v2" },
  ];

  it("uses the nearest file entry in the version chain", () => {
    const files = [
      { versionId: "v1", path: "/index.html", hash: "old" },
      { versionId: "v2", path: "/about.html", hash: "about" },
      { versionId: "v3", path: "/index.html", hash: "new" },
    ];

    expect(resolveVersionPath({ versions, files, currentVersionId: "v3", path: "/index.html" })).toEqual({
      hash: "new",
      versionId: "v3",
    });
    expect(resolveVersionPath({ versions, files, currentVersionId: "v3", path: "/about.html" })).toEqual({
      hash: "about",
      versionId: "v2",
    });
  });

  it("treats tombstones as not found", () => {
    const files = [
      { versionId: "v1", path: "/index.html", hash: "old" },
      { versionId: "v2", path: "/index.html", hash: TOMBSTONE_HASH },
    ];

    expect(resolveVersionPath({ versions, files, currentVersionId: "v2", path: "/index.html" })).toBeNull();
  });

  it("sets security and cache headers for served files", () => {
    const html = headersForServedPath("/index.html");
    expect(html.get("X-Content-Type-Options")).toBe("nosniff");
    expect(html.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(html.get("Cache-Control")).toBe("public, max-age=60");

    const svg = headersForServedPath("/icon.svg");
    expect(svg.get("Content-Disposition")).toBe("attachment");
    expect(svg.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("extracts hosted file paths from the request URL instead of Hono splat params", () => {
    expect(rawServePathFromUrl("http://localhost:7777/api/public/s/demo/style.css", "demo")).toBe("style.css");
    expect(rawServePathFromUrl("http://localhost:7777/api/public/s/demo/assets/app.js?x=1", "demo")).toBe("assets/app.js");
    expect(rawServePathFromUrl("http://localhost:7777/api/public/s/demo", "demo")).toBe("");
  });
});
