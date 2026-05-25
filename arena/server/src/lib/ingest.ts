import { contestants, decisions, upstreamCache } from "@defs";
import { numberish } from "./upstream";

export const INGEST_AGENTS_RESOURCE = "ingest:agents";
export const INGEST_SNAPSHOTS_RESOURCE = "ingest:snapshots";
export const MAX_INGEST_BYTES = 5 * 1024 * 1024;

export interface UpstreamAgentPayload {
  agents: UpstreamAgent[];
}

export interface UpstreamAgent {
  id: string;
  name: string;
  company?: string;
  color?: string;
  account?: Record<string, unknown>;
  positions?: unknown[];
  metrics?: Record<string, unknown>;
}

export interface SnapshotsPayload {
  snapshots: Record<string, Array<{ fetchedAt: number | string; equity: number | string }>>;
}

export interface UpstreamDecision {
  id: number | string;
  agentId: string;
  symbol: string;
  action: string;
  qty?: number | string | null;
  price?: number | string | null;
  stopLoss?: number | string | null;
  profitTarget?: number | string | null;
  riskUsd?: number | string | null;
  confidence?: number | string | null;
  confidenceNum?: number | string | null;
  reasoning?: string | null;
  justification?: string | null;
  chainOfThought?: string | null;
  timestamp?: number | string | null;
  createdAt?: number | string | null;
}

export interface DecisionsPayload {
  decisions: UpstreamDecision[];
}

export function validateAgentsPayload(value: unknown): value is UpstreamAgentPayload {
  if (!isRecord(value) || !Array.isArray(value.agents)) return false;
  return value.agents.every((agent) =>
    isRecord(agent) &&
    typeof agent.id === "string" &&
    typeof agent.name === "string" &&
    (agent.company === undefined || typeof agent.company === "string") &&
    (agent.color === undefined || typeof agent.color === "string") &&
    (agent.account === undefined || isRecord(agent.account)) &&
    (agent.positions === undefined || Array.isArray(agent.positions)) &&
    (agent.metrics === undefined || isRecord(agent.metrics))
  );
}

export function validateSnapshotsPayload(value: unknown): value is SnapshotsPayload {
  if (!isRecord(value) || !isRecord(value.snapshots)) return false;
  return Object.values(value.snapshots).every((points) =>
    Array.isArray(points) &&
    points.every((point) =>
      isRecord(point) &&
      (typeof point.fetchedAt === "number" || typeof point.fetchedAt === "string") &&
      (typeof point.equity === "number" || typeof point.equity === "string")
    )
  );
}

export function validateDecisionsPayload(value: unknown): value is DecisionsPayload {
  if (!isRecord(value) || !Array.isArray(value.decisions)) return false;
  return value.decisions.every((item) =>
    isRecord(item) &&
    (typeof item.id === "number" || typeof item.id === "string") &&
    typeof item.agentId === "string" &&
    typeof item.symbol === "string" &&
    typeof item.action === "string"
  );
}

export async function storeAgentsPayload(payload: UpstreamAgentPayload, now: number): Promise<number> {
  const { db } = await import("edgespark");
  const json = JSON.stringify(payload);
  await db
    .insert(upstreamCache)
    .values({ resource: INGEST_AGENTS_RESOURCE, payload: json, fetchedAt: now })
    .onConflictDoUpdate({ target: upstreamCache.resource, set: { payload: json, fetchedAt: now } });
  const existingRows = await db.select({ id: contestants.id, sortOrder: contestants.sortOrder }).from(contestants);
  const existing = new Set(existingRows.map((row) => row.id));
  let nextSortOrder = existingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  for (const agent of payload.agents) {
    if (existing.has(agent.id)) continue;
    await db
      .insert(contestants)
      .values({
        id: agent.id,
        displayName: agent.name,
        tagline: agent.company ?? "",
        avatarS3Uri: null,
        accentColor: agent.color ?? "#2556B6",
        sortOrder: nextSortOrder++,
        hidden: 0,
        updatedAt: now,
      })
      .onConflictDoNothing();
    existing.add(agent.id);
  }
  return payload.agents.length;
}

export async function storeSnapshotsPayload(payload: SnapshotsPayload, now: number): Promise<number> {
  const { db } = await import("edgespark");
  const json = JSON.stringify(payload);
  await db
    .insert(upstreamCache)
    .values({ resource: INGEST_SNAPSHOTS_RESOURCE, payload: json, fetchedAt: now })
    .onConflictDoUpdate({ target: upstreamCache.resource, set: { payload: json, fetchedAt: now } });
  return Object.values(payload.snapshots).reduce((sum, points) => sum + points.length, 0);
}

export async function storeDecisionsPayload(payload: DecisionsPayload): Promise<number> {
  const { db } = await import("edgespark");
  const seen = new Set<number>();
  for (const item of payload.decisions) {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id)) continue;
    seen.add(id);
    const createdAt = toMs(item.createdAt ?? item.timestamp ?? Date.now());
    await db
      .insert(decisions)
      .values({
        id,
        contestantId: item.agentId,
        symbol: item.symbol,
        action: item.action,
        qty: numberish(item.qty),
        price: numberish(item.price),
        stopLoss: numberish(item.stopLoss),
        profitTarget: numberish(item.profitTarget),
        riskUsd: numberish(item.riskUsd),
        confidence: numberish(item.confidence),
        confidenceNum: Math.round(numberish(item.confidenceNum)),
        reasoning: item.reasoning ?? "",
        justification: item.justification ?? "",
        chainOfThought: item.chainOfThought ?? "",
        timestamp: toMs(item.timestamp ?? createdAt),
        createdAt,
      })
      .onConflictDoNothing();
  }
  return seen.size;
}

export function parseCachedPayload<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function toMs(value: unknown): number {
  const parsed = toEpochMs(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function toEpochMs(value: unknown): number {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n < 10_000_000_000 ? n * 1000 : n;
    const d = Date.parse(value);
    if (Number.isFinite(d)) return d;
  }
  return Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
