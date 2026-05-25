import { numberish } from "./upstream";

export interface UpstreamAgentForMerge {
  id: string;
  name: string;
  company?: string;
  color?: string;
  account?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}

export interface ContestantOverride {
  id: string;
  displayName: string;
  tagline: string;
  avatarUrl?: string | null;
  accentColor: string;
  sortOrder: number;
  hidden: number;
}

export function mergeContestants(
  agents: readonly UpstreamAgentForMerge[],
  overrides: readonly ContestantOverride[],
  totals: ReadonlyMap<string, number>
) {
  const localById = new Map(overrides.map((row) => [row.id, row]));
  return agents
    .map((agent) => {
      const override = localById.get(agent.id);
      const account = coerceRecord(agent.account ?? {});
      const metrics = coerceRecord(agent.metrics ?? {});
      return {
        id: agent.id,
        displayName: override?.displayName ?? agent.name,
        tagline: override?.tagline ?? agent.company ?? "",
        avatarUrl: override?.avatarUrl ?? null,
        accentColor: override?.accentColor ?? agent.color ?? "#2556B6",
        sortOrder: override?.sortOrder ?? 0,
        hidden: override?.hidden === 1,
        equity: numberish(account.equity),
        returnPct: numberish(metrics.returnPct),
        rank: 0,
        votes: totals.get(agent.id) ?? 0,
        totalPnl: numberish(metrics.totalPnl),
        sharpe: numberish(metrics.sharpe),
        winRate: numberish(metrics.winRate),
      };
    })
    .filter((row) => !row.hidden)
    .sort((a, b) => b.equity - a.equity || a.sortOrder - b.sortOrder)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function missingAgentsForSync<T extends { id: string }>(agents: readonly T[], existingIds: ReadonlySet<string>): T[] {
  return agents.filter((agent) => !existingIds.has(agent.id));
}

export function coerceRecord(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v]));
}

