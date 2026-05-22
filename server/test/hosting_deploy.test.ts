import { describe, expect, it } from "vitest";
import { missingHashesForManifest, normalizeDeployManifest } from "../src/lib/hosting/deploy";

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
});
