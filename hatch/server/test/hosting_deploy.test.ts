import { describe, expect, it } from "vitest";
import { hostingBlobKey } from "../src/lib/hosting/blobKeys";
import { missingHashesForManifest, normalizeDeployManifest, rawFilePathFromUrl } from "../src/lib/hosting/deploy";

describe("rawFilePathFromUrl", () => {
  const id = "7c5dd1c8-bd9d-4f2f-b866-0d71bd542d20";
  const base = `https://host.example/api/public/manage/sites/${id}/files`;

  // Regression: the file PUT/DELETE routes used to read Hono's wildcard param, which
  // returns undefined in the production runtime → every edit/delete silently hit
  // /index.html. The path must be derived from the URL instead.
  it("extracts the path after the site-scoped /files/ marker", () => {
    expect(rawFilePathFromUrl(`${base}/index.html`, id)).toBe("index.html");
    expect(rawFilePathFromUrl(`${base}/pricing.html`, id)).toBe("pricing.html");
  });

  it("preserves nested (multi-segment) paths", () => {
    expect(rawFilePathFromUrl(`${base}/css/app.css`, id)).toBe("css/app.css");
    expect(rawFilePathFromUrl(`${base}/a/b/c/page.html`, id)).toBe("a/b/c/page.html");
  });

  it("ignores query strings and keeps percent-encoding for the normalizer", () => {
    expect(rawFilePathFromUrl(`${base}/img/logo%20copy.png?v=2`, id)).toBe("img/logo%20copy.png");
  });

  it("returns empty string when the marker is absent", () => {
    expect(rawFilePathFromUrl("https://host.example/elsewhere", id)).toBe("");
  });
});

describe("hosting deploy helpers", () => {
  it("normalizes deploy manifest paths and deduplicates missing hashes", () => {
    const manifest = normalizeDeployManifest([
      { path: "", hash: "a".repeat(64), size: 12, contentType: "text/html" },
      { path: "assets/app.js", hash: "b".repeat(64), size: 34, contentType: "text/javascript" },
      { path: "/assets/app-copy.js", hash: "b".repeat(64), size: 34, contentType: "text/javascript" },
    ]);

    expect(manifest.map((entry) => entry.path)).toEqual(["/index.html", "/assets/app.js", "/assets/app-copy.js"]);
    expect(missingHashesForManifest(manifest, new Set(["a".repeat(64)]))).toEqual(["b".repeat(64)]);
  });

  it("rejects duplicate paths after normalization", () => {
    expect(() =>
      normalizeDeployManifest([
        { path: "", hash: "a".repeat(64), size: 1, contentType: "text/html" },
        { path: "/", hash: "b".repeat(64), size: 1, contentType: "text/html" },
      ])
    ).toThrow(/duplicate path/i);
  });

  it("uses global content-addressed R2 keys", () => {
    const hash = "a".repeat(64);
    expect(hostingBlobKey(hash)).toBe(hash);
    expect(hostingBlobKey(hash)).not.toContain("/");
  });
});
