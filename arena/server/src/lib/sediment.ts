import { decisions } from "@defs";
import { fetchUpstream, numberish } from "./upstream";

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

export function uniqueIncomingDecisionIds(items: readonly UpstreamDecision[]): number[] {
  const seen = new Set<number>();
  for (const item of items) {
    const id = Number(item.id);
    if (Number.isSafeInteger(id)) seen.add(id);
  }
  return [...seen];
}

export async function ingestDecisions(upstreamBaseUrl: string): Promise<number> {
  const payload = await fetchUpstream<DecisionsPayload>("agent/decisions", upstreamBaseUrl);
  if (!payload?.decisions?.length) return 0;
  const { db } = await import("edgespark");
  let inserted = 0;
  for (const item of payload.decisions) {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id)) continue;
    const createdAt = toMs(item.createdAt ?? item.timestamp ?? Date.now());
    const result = await db
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
      .onConflictDoNothing()
      .returning({ id: decisions.id });
    inserted += result.length;
  }
  return inserted;
}

function toMs(value: unknown): number {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n < 10_000_000_000 ? n * 1000 : n;
    const d = Date.parse(value);
    if (Number.isFinite(d)) return d;
  }
  return Date.now();
}
