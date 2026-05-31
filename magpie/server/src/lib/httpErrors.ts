import type { Context } from "hono";

export function httpError(c: Context, status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return c.json({ error: { code, message, requestId: crypto.randomUUID(), ...extra } }, status as never);
}
