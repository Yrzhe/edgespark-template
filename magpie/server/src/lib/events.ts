import { ctx, db } from "edgespark";
import { events } from "@defs";
import { newId } from "./ids";

export type EventLevel = "error" | "warn" | "info" | "audit";

type EventOptions = {
  userId?: string | null;
  route?: string | null;
  meta?: Record<string, unknown> | null;
};

const SECRET_KEY_RE = /(password|token|secret|authorization|api[-_]?key|keyHash|bearer|cookie|session)/i;

export async function logEvent(level: EventLevel, code: string, message: string, opts: EventOptions = {}): Promise<void> {
  const work = (async () => {
    await db.insert(events).values({
      id: newId("evt"),
      level,
      code: code.slice(0, 96),
      message: message.slice(0, 500),
      userId: opts.userId ?? null,
      route: opts.route ?? null,
      metaJson: JSON.stringify(sanitizeMeta(opts.meta ?? {})),
      createdAt: Date.now(),
    });
  })().catch((error) => {
    console.warn(JSON.stringify({ level: "warn", code: "event_log_failed", error: String(error) }));
  });
  ctx.runInBackground?.(work);
  await work;
}

function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max-depth]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMeta(item, depth + 1));
  if (typeof value !== "object") return String(value);
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    out[key] = SECRET_KEY_RE.test(key) ? "[redacted]" : sanitizeMeta(inner, depth + 1);
  }
  return out;
}
