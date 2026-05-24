import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { buildLlmsTxt } from "../src/lib/llms";

// TODO(scaffold): copy into `server/test/llms.test.ts` after the Perch scaffold
// exists. The route test mirrors `publicOrigin()` behavior because that helper is
// intentionally file-local in `routes/public.ts`.

describe("Perch llms.txt builder", () => {
  it("builds agent docs from an injected base URL", () => {
    const doc = buildLlmsTxt("https://perch.example/");

    expect(doc).toContain("# Perch");
    expect(doc).toContain("Base URL: https://perch.example");
    expect(doc).toContain("Authorization: Bearer <key>");
    expect(doc).toContain("POST https://perch.example/api/public/manage/pages");
    expect(doc).toContain("POST https://perch.example/api/public/manage/pages/:pageId/links");
    expect(doc).toContain("POST https://perch.example/api/public/manage/pages/:pageId/assets/presign");
    expect(doc).toContain('{"kind":"thumbnail","filename":"thumb.jpg","contentType":"image/jpeg"}');
    expect(doc).toContain("GET https://perch.example/api/public/manage/pages/:pageId/analytics");
    expect(doc).toContain("DELETE https://perch.example/api/public/manage/keys/:id");
    expect(doc).not.toContain("localhost");
  });

  it("injects base URL from forwarded headers on the public route", async () => {
    const app = new Hono().get("/api/public/llms.txt", (c) => {
      const proto = c.req.header("x-forwarded-proto") ?? "https";
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      const origin = host ? `${proto}://${host}` : new URL(c.req.url).origin;
      return new Response(buildLlmsTxt(origin), {
        headers: { "Content-Type": "text/plain;charset=utf-8" },
      });
    });

    const res = await app.request("http://internal-worker/api/public/llms.txt", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "owner.perch.example",
      },
    });
    const text = await res.text();

    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(text).toContain("Base URL: https://owner.perch.example");
    expect(text).toContain("POST https://owner.perch.example/api/public/manage/pages");
  });

  it("serves agent.md as Markdown content", async () => {
    const app = new Hono().get("/api/public/agent.md", () => new Response(buildLlmsTxt("https://perch.example"), {
      headers: { "Content-Type": "text/markdown;charset=utf-8" },
    }));

    const res = await app.request("https://perch.example/api/public/agent.md");

    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });
});
