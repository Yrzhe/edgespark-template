import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/lib/llm/prompt";
import { PRECISE_FIELD_NAMES, type VisitorPrivate } from "../src/lib/signals/types";

describe("LLM prompt builder", () => {
  it("serializes only prompt-safe visitor fields", () => {
    const visitor: VisitorPrivate = {
      coarse: { country: "US", langRoot: "en", device: "desktop", referrerRoot: "github", hourBand: "day", isReturning: false, isWeekend: false, urlSource: "tw" },
      precise: { ip: "203.0.113.9", city: "Secret City", region: "Hidden", asn: 123, asOrganization: "Secret ISP", colo: "SJC", timezoneRaw: "America/Los_Angeles", userAgentRaw: "IGNORE_PREVIOUS", referrerUrlRaw: "https://github.com/private" },
      hashes: { ipHash: "ip", userAgentHash: "ua", visitorBucketHash: "bucket" },
    };
    const prompt = buildPrompt({
      visitor,
      candidateThemes: [{ id: "t1", layoutKey: "terminal", name: "Terminal", defaultTone: "direct", copyPrompt: "concise" }],
      content: { bioBlurbs: [], projects: [], socials: [] },
    });
    const json = JSON.stringify(prompt);

    for (const field of PRECISE_FIELD_NAMES) expect(json).not.toContain(`"${field}"`);
    expect(json).not.toContain("Secret City");
    expect(json).not.toContain("IGNORE_PREVIOUS");
    expect(json).toContain('"referrerRoot":"github"');
  });
});
