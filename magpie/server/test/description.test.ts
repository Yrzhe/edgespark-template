import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, secret } from "edgespark";
import { buildPresignedGetUrl, describeAssetFromUrl } from "../src/lib/description/autotag";

describe("asset auto description", () => {
  beforeEach(() => {
    db._reset();
    (secret as any).values.set("OPENAI_API_KEY", "sk-test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (secret as any).values.delete("OPENAI_API_KEY");
  });

  it("calls gpt-4o-mini with vision input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "A coral figure on a navy background." } }] }), { status: 200 }));
    const sentence = await describeAssetFromUrl({ assetId: "asset1", userId: "u1", imageUrl: "https://signed.example/a.png" });
    expect(sentence).toBe("A coral figure on a navy background.");
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.messages[0].content[1].image_url.url).toBe("https://signed.example/a.png");
  });

  it("builds a real, externally-fetchable presigned GET URL from an s3 uri", async () => {
    const url = await buildPresignedGetUrl("s3://magpie-media/assets/agent-gen/badge.png");
    // Must NOT be the non-routable placeholder host that breaks OpenAI vision fetches.
    expect(url).not.toContain("assets.internal");
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain(encodeURIComponent("assets/agent-gen/badge.png"));
  });

  it("rejects a non-s3 uri", async () => {
    await expect(buildPresignedGetUrl("https://evil.example/x.png")).rejects.toThrow("invalid_asset_uri");
  });
});
