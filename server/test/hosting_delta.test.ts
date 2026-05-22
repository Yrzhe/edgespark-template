import { describe, expect, it } from "vitest";
import { TOMBSTONE_HASH, resolveVersionPath } from "../src/lib/hosting/serve";

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
});
