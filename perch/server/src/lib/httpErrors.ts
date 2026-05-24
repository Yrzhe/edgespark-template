import type { Context } from "hono";

export function httpError(c: Context, status: number, code: string, message: string) {
  const requestId = crypto.randomUUID();
  console.error(
    JSON.stringify({ level: "error", requestId, status, code, method: c.req.method, path: c.req.path })
  );
  return c.json({ error: { code, message, requestId } }, status as never);
}
