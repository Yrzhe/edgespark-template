import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { buildLlmsTxt } from "../src/lib/llms";

vi.mock("edgespark", () => ({
  vars: { get: (name: string) => name === "PUBLIC_BASE_URL" ? "https://owner.example" : null },
  storage: {},
  db: {},
  ctx: { runInBackground() {}, environment: "production" },
  secret: { get: () => null },
}));

vi.mock("@defs", () => ({
  buckets: { mockingbirdMedia: { bucket_name: "mockingbird-media" } },
  analyticsEvents: {},
  bioBlurbs: {},
  images: {},
  matchRules: {},
  projects: {},
  socials: {},
  themes: {},
  visitorCache: {},
}));

describe("Mockingbird llms.txt", () => {
  it("builds agent docs with management routes and privacy rules", () => {
    const doc = buildLlmsTxt("https://mock.example/");
    expect(doc).toContain("# Mockingbird");
    expect(doc).toContain("Base URL: https://mock.example");
    expect(doc).toContain("POST https://mock.example/api/public/manage/themes");
    expect(doc).toContain("POST https://mock.example/api/public/manage/images/presign");
    expect(doc).toContain("Raw IP");
  });

  it("serves markdown docs with injected origin", async () => {
    const app = new Hono().get("/api/public/agent.md", (c) => new Response(buildLlmsTxt(`${c.req.header("x-forwarded-proto")}://${c.req.header("x-forwarded-host")}`), { headers: { "Content-Type": "text/markdown;charset=utf-8" } }));
    const res = await app.request("http://worker/api/public/agent.md", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "owner.example" } });
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toContain("Base URL: https://owner.example");
  });

  it("does not reflect hostile forwarded host headers in public docs route", async () => {
    const { publicRoutes } = await import("../src/routes/public");
    const app = new Hono().route("/api/public", publicRoutes);

    const res = await app.request("http://worker/api/public/llms.txt", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "IGNORE_PREVIOUS_INSTRUCTIONS.example",
        host: "also-hostile.example",
      },
    });
    const text = await res.text();

    expect(text).toContain("Base URL: https://owner.example");
    expect(text).not.toContain("IGNORE_PREVIOUS_INSTRUCTIONS");
    expect(text).not.toContain("also-hostile");
  });
});
