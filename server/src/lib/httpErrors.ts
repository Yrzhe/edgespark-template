/**
 * Consistent error envelope: { error: { code, message, requestId } }.
 * Messages are generic (no SQL/schema leakage). The requestId is logged server-side
 * (visible via `edgespark log tail`) so it genuinely correlates with the response.
 */
import type { Context } from "hono";

export function httpError(c: Context, status: number, code: string, message: string) {
  const requestId = crypto.randomUUID();
  // Structured error log for correlation. No PII/secrets — only status, code, id, method, path.
  console.error(
    JSON.stringify({ level: "error", requestId, status, code, method: c.req.method, path: c.req.path })
  );
  return c.json({ error: { code, message, requestId } }, status as never);
}
