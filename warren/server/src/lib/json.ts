import type { Context } from "hono";

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > maxLength ? undefined : trimmed;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return message.includes("unique") || message.includes("constraint failed");
}
