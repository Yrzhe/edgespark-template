import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "edgespark";
import { storeGeneratedPng } from "../src/lib/imagegen/store";

describe("storeGeneratedPng", () => {
  beforeEach(() => {
    (storage as any)._resetPuts();
  });

  it("uploads the png to the magpie-media bucket and returns a canonical s3 uri", async () => {
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    const s3Uri = await storeGeneratedPng("asset_abc", png);

    const puts = (storage as any)._puts;
    expect(puts.length).toBe(1);
    expect(puts[0].bucket).toBe("magpie-media");
    expect(puts[0].path).toBe("assets/agent-gen/asset_abc.png");
    expect(puts[0].contentType).toBe("image/png");
    expect(puts[0].size).toBe(5);

    expect(s3Uri).toBe("s3://magpie-media/assets/agent-gen/asset_abc.png");
    // Must round-trip through the parser used by the describe path.
    const parsed = storage.tryParseS3Uri(s3Uri);
    expect(parsed?.bucket.bucket_name).toBe("magpie-media");
    expect(parsed?.path).toBe("assets/agent-gen/asset_abc.png");
  });
});
