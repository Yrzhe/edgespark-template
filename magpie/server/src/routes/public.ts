import { Hono } from "hono";
import type { Context } from "hono";
import { vars } from "edgespark";
import { logEvent } from "../lib/events";
import { buildLlmsTxt } from "../lib/llms";
import { httpError } from "../lib/httpErrors";
import { isSignupWhitelisted } from "../lib/signupWhitelist";

export const publicRoutes = new Hono()
  .get("/llms.txt", (c) => docs(c))
  .get("/agent.md", (c) => docs(c, "text/markdown;charset=utf-8"))
  .post("/signup-check", async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email : "";
    if (!email) return httpError(c, 400, "email_required", "Email is required.");
    const allowed = await isSignupWhitelisted(email);
    if (!allowed) {
      void logEvent("audit", "whitelist_reject", email, { route: c.req.path });
      return httpError(c, 403, "signup_not_whitelisted", "This email is not on the signup whitelist.");
    }
    return c.json({ allowed: true });
  });

async function docs(c: Context, contentType = "text/plain;charset=utf-8"): Promise<Response> {
  return new Response(buildLlmsTxt(publicOrigin(c)), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" } });
}

function publicOrigin(c: Context): string {
  const configured = vars.get("PUBLIC_BASE_URL");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Keep docs deterministic instead of reflecting untrusted headers.
    }
  }
  const url = new URL(c.req.url);
  return url.origin;
}
