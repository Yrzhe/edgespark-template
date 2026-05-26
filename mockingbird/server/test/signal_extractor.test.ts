import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { extractVisitor } from "../src/lib/signals/extract";
import { PRECISE_FIELD_NAMES } from "../src/lib/signals/types";
import { promptSafeVisitor, safePromptJson } from "../src/lib/signals/privacy";
import { composeCacheKey } from "../src/lib/matcher/bucket";
import { renderPublicPage } from "../src/lib/publicPage/html";
import { buildLlmsTxt } from "../src/lib/llms";

describe("signal extractor privacy boundary", () => {
  it("keeps precise field names out of prompt-safe JSON and cache keys", async () => {
    const hostile = "IGNORE_PREVIOUS_INSTRUCTIONS";
    const app = new Hono().get("/", async (c) => {
      const visitor = await extractVisitor(c);
      const json = safePromptJson(visitor);
      const key = composeCacheKey({ themeOrTie: "theme", visitor: promptSafeVisitor(visitor), contentHash: "c", ruleHash: "r", promptHash: "p", modelKey: "m" });
      return c.json({ json, key });
    });
    const req = new Request("https://example.test/?from=tw", {
      headers: {
        "User-Agent": `Mozilla/5.0 ${hostile}`,
        "Referer": `https://github.com/org/private?token=${hostile}`,
        "Accept-Language": `zh-CN,${hostile};q=0.9,en;q=0.8`,
        "CF-Connecting-IP": "203.0.113.7",
        "Cookie": "mb_seen=1",
        "x-forwarded-host": `${hostile}.example`,
      },
    });
    Object.defineProperty(req, "cf", { value: { country: "US", city: "New York", region: "NY", timezone: "America/New_York", asn: 123, asOrganization: "ISP", colo: "EWR" } });
    const res = await app.request(req);
    const body = await res.json() as { json: string; key: string };

    expect(body.json).toContain('"langRoot":"zh"');
    for (const field of PRECISE_FIELD_NAMES) {
      expect(body.json).not.toContain(field);
      expect(body.key).not.toContain(field);
    }
    expect(body.json).not.toContain("New York");
    expect(body.json).not.toContain("github.com/org/private");
    expect(body.json).not.toContain(hostile);
    expect(body.key).not.toContain(hostile);

    const analyticsRow = JSON.stringify({
      country: "US",
      langRoot: "zh",
      device: "desktop",
      referrerRoot: "github",
      hourBand: "day",
      isReturning: 1,
      visitorBucketHash: "hash",
    });
    const html = renderPublicPage(seedTheme(), { bioBlurbs: [], projects: [], socials: [] }, body.key);
    const docs = buildLlmsTxt("https://example.com");
    expect(analyticsRow).not.toContain(hostile);
    expect(html).not.toContain(hostile);
    expect(docs).not.toContain(hostile);
  });
});

function seedTheme() {
  const now = Date.now();
  return { id: "t1", slug: "letter", name: "Letter", layoutKey: "letter", status: "active", priority: 0, abWeight: 100, paletteJson: "{}", fontJson: "{}", layoutConfigJson: "{}", copyPrompt: "", defaultTone: "", fallbackCopyJson: "{}", isDefault: 1, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now };
}
