/**
 * Consistent error envelope: { error: { code, message, requestId } }.
 * Messages are generic (no SQL/schema leakage); requestId correlates with server logs.
 */
import type { Context } from "hono";

export function httpError(c: Context, status: number, code: string, message: string) {
  return c.json({ error: { code, message, requestId: crypto.randomUUID() } }, status as never);
}
