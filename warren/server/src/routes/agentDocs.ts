import { Hono } from "hono";
import type { Context } from "hono";
import { buildApiDocs, buildLlmsTxt, buildWarrenSkillMd } from "../lib/llms";

export const agentDocsRoutes = new Hono()
  .get("/llms.txt", async (c) => textResponse(await buildLlmsTxt(publicOrigin(c)), "text/plain;charset=utf-8"))
  .get("/warren-skill.md", (c) => textResponse(buildWarrenSkillMd(publicOrigin(c)), "text/markdown;charset=utf-8"))
  .get("/api-docs", (c) => textResponse(buildApiDocs(publicOrigin(c)), "text/markdown;charset=utf-8"));

function textResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

function publicOrigin(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  return host ? `${proto}://${host}` : new URL(c.req.url).origin;
}
