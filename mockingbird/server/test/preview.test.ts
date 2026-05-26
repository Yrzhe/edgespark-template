import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { renderPreviewPage } from "../src/lib/publicPage/html";
import { verifyPreviewToken } from "../src/lib/previewToken";

vi.mock("edgespark", () => ({
  db: {
    select: () => ({
      from: (table: { __name?: string }) => ({
        where: () => table.__name === "previewRateLimits"
          ? { limit: async () => [] }
          : Promise.resolve([{ costMicros: 2 }]),
      }),
    }),
    insert: () => ({ values: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
  vars: { get: (name: string) => name === "DAILY_LLM_BUDGET_USD" ? "0.000001" : "owner@example.com" },
  secret: { get: () => "test-secret" },
  ctx: { environment: "production", runInBackground() {} },
}));

vi.mock("@defs", () => ({
  analyticsEvents: {},
  bioBlurbs: {},
  dailyAnalyticsRollups: {},
  images: {},
  matchRules: {},
  previewRateLimits: { __name: "previewRateLimits", principalKey: "principalKey", windowStart: "windowStart", id: "id" },
  projects: {},
  socials: {},
  themes: {},
  visitorCache: {},
}));

vi.mock("../src/lib/publicData", () => ({
  loadPublicContext: async () => ({
    theme: seedTheme(),
    themes: [seedTheme()],
    selection: { candidates: [{ theme: seedTheme(), score: 1 }] },
    content: { bioBlurbs: [], projects: [], socials: [] },
    cacheKey: "preview-cache",
  }),
}));

describe("preview share", () => {
  it("signs an expiring preview token and marks preview HTML noindex", async () => {
    const { previewManageRoutes } = await import("../src/routes/managePreview");
    const app = new Hono().route("/api/public/manage", previewManageRoutes);
    const res = await app.request("/api/public/manage/preview/share", { method: "POST", body: JSON.stringify({ signals: { device: "mobile" } }) });
    const body = await res.json() as { token: string; robots: string };

    expect(res.status).toBe(201);
    expect(body.token).toContain(".");
    expect(body.robots).toBe("noindex,nofollow");
    expect(renderPreviewPage(seedTheme(), { bioBlurbs: [], projects: [], socials: [] }, "cache")).toContain("noindex,nofollow");
    expect(renderPreviewPage(seedTheme(), { bioBlurbs: [], projects: [], socials: [] }, "cache")).toContain("PREVIEW - do not share");
    await expect(verifyPreviewToken(body.token)).resolves.toMatchObject({ ok: true });
  });

  it("returns budget_exhausted before provider work for preview rewrites", async () => {
    const { previewManageRoutes } = await import("../src/routes/managePreview");
    const app = new Hono().route("/api/public/manage", previewManageRoutes);

    const res = await app.request("/api/public/manage/preview", {
      method: "POST",
      body: JSON.stringify({ rewrite: true, signals: { device: "desktop" } }),
    });
    const body = await res.json() as { error: { code: string } };

    expect(res.status).toBe(429);
    expect(body.error.code).toBe("budget_exhausted");
  });
});

function seedTheme() {
  const now = Date.now();
  return { id: "t1", slug: "letter", name: "Letter", layoutKey: "letter", status: "active", priority: 0, abWeight: 100, paletteJson: "{}", fontJson: "{}", layoutConfigJson: "{}", copyPrompt: "", defaultTone: "", fallbackCopyJson: "{}", isDefault: 1, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now };
}
