import { Hono } from "hono";
import { httpError } from "../lib/httpErrors";
import {
  MAX_INGEST_BYTES,
  storeAgentsPayload,
  storeDecisionsPayload,
  storeSnapshotsPayload,
  validateAgentsPayload,
  validateDecisionsPayload,
  validateSnapshotsPayload,
} from "../lib/ingest";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";

const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

export const ingestRoutes = new Hono().post("/ingest", async (c) => {
  const length = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_INGEST_BYTES) {
    return httpError(c, 413, "payload_too_large", "Ingest payload is too large.");
  }
  if (!allowRequest(c.req.raw)) return httpError(c, 429, "rate_limited", "Too many ingest requests.");

  const body = await readJson(c.req.raw);
  if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
  const encodedSize = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (encodedSize > MAX_INGEST_BYTES) return httpError(c, 413, "payload_too_large", "Ingest payload is too large.");

  const counts = { agents: 0, snapshots: 0, decisions: 0 };
  const now = Date.now();
  if (body.agents !== undefined) {
    if (!validateAgentsPayload(body.agents)) return httpError(c, 400, "invalid_agents", "agents payload shape is invalid.");
    const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
    counts.agents = await storeAgentsPayload(body.agents, now, comp.activeSeasonId);
  }
  if (body.snapshots !== undefined) {
    if (!validateSnapshotsPayload(body.snapshots)) return httpError(c, 400, "invalid_snapshots", "snapshots payload shape is invalid.");
    counts.snapshots = await storeSnapshotsPayload(body.snapshots, now);
  }
  if (body.decisions !== undefined) {
    if (!validateDecisionsPayload(body.decisions)) return httpError(c, 400, "invalid_decisions", "decisions payload shape is invalid.");
    counts.decisions = await storeDecisionsPayload(body.decisions);
  }
  if (body.agents === undefined && body.snapshots === undefined && body.decisions === undefined) {
    return httpError(c, 400, "invalid_request", "At least one of agents, snapshots, or decisions is required.");
  }
  return c.json({ ok: true, counts });
});

function allowRequest(request: Request): boolean {
  const key = request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
