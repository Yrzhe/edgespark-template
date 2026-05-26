import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { streamAdapt } from "../src/lib/llm/stream";

vi.mock("edgespark", () => ({ db: {}, vars: { get: () => null }, secret: { get: () => null }, ctx: { runInBackground() {}, environment: "production" } }));
vi.mock("@defs", () => ({
  analyticsEvents: {},
  bioBlurbs: {},
  images: {},
  matchRules: {},
  projects: {},
  socials: {},
  themes: {},
  visitorCache: {},
}));

describe("SSE stream", () => {
  it("leaves fallback intact on cache-key mismatch before provider work", async () => {
    const app = new Hono().get("/api/public/adapt/stream", (c) => streamAdapt(c, { model: "test", chatJson: async () => { throw new Error("should_not_call"); } }));
    const res = await app.request("https://example.test/api/public/adapt/stream");
    const text = await res.text();
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(text).toContain("cache_key_mismatch");
    expect(text).toContain("event: done");
  });
});
