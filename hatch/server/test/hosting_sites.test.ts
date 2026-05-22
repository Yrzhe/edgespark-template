import { describe, expect, it } from "vitest";
import { generateSiteKey, insertSiteWithRetry, newSlug } from "../src/lib/hosting/sites";

describe("hosting site helpers", () => {
  it("generates a public site key", () => {
    const key = generateSiteKey();
    expect(key.startsWith("sk_")).toBe(true);
    expect(key.length).toBeGreaterThan(30);
  });

  it("creates readable slugs with a random suffix", () => {
    const slug = newSlug("My Test Site!");
    expect(slug).toMatch(/^my-test-site-[a-z0-9]{6}$/);
  });

  it("falls back to site for empty generated slug bases", () => {
    const slug = newSlug("!!!");
    expect(slug).toMatch(/^site-[a-z0-9]{6}$/);
  });

  it("retries inserts on unique slug or site key collisions", async () => {
    const attemptedSlugs: string[] = [];
    const row = await insertSiteWithRetry(
      {
        name: "Collision Test",
        spaMode: false,
        slugFactory: () => `site-${attemptedSlugs.length}`,
        siteKeyFactory: () => "sk_fixed",
        idFactory: () => `id_${attemptedSlugs.length}`,
        now: () => 123,
      },
      async (candidate) => {
        attemptedSlugs.push(candidate.slug);
        if (attemptedSlugs.length < 3) {
          throw new Error("UNIQUE constraint failed: sites.slug");
        }
        return candidate;
      }
    );

    expect(attemptedSlugs).toEqual(["site-0", "site-1", "site-2"]);
    expect(row.slug).toBe("site-2");
    expect(row.siteKey).toBe("sk_fixed");
  });
});
