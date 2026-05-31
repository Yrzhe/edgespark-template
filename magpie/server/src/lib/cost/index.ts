import { and, eq, gte } from "drizzle-orm";
import { costLedger } from "@defs";
import { getDailyBudgetUsd } from "../ownerConfig";
import { newId } from "../ids";

export interface CostQuoteItem {
  provider: string;
  operation: string;
  units: number;
  unitMicros: number;
}

export interface CostQuote {
  userId: string;
  items: CostQuoteItem[];
  totalMicros: number;
  dailyUsedMicros: number;
  dailyCapMicros: number;
  allowed: boolean;
  remainingMicros: number;
}

export function quoteItems(items: CostQuoteItem[]): number {
  return items.reduce((sum, item) => sum + item.units * item.unitMicros, 0);
}

export async function checkCost(db: any, userId: string, items: CostQuoteItem[], now = Date.now(), dailyCapMicros = Math.round(getDailyBudgetUsd() * 1_000_000)): Promise<CostQuote> {
  const dayStart = startOfUtcDay(now);
  const rows = await db.select().from(costLedger).where(and(eq(costLedger.userId, userId), gte(costLedger.occurredAt, dayStart)));
  const dailyUsedMicros = rows.reduce((sum: number, row: { costMicros?: number }) => sum + Number(row.costMicros ?? 0), 0);
  const totalMicros = quoteItems(items);
  const remainingMicros = dailyCapMicros - dailyUsedMicros;
  return { userId, items, totalMicros, dailyUsedMicros, dailyCapMicros, allowed: totalMicros <= remainingMicros, remainingMicros };
}

export async function writeCost(db: any, quote: CostQuote, agentRunId?: string | null, now = Date.now()): Promise<void> {
  if (!quote.allowed) throw new Error("budget_exhausted");
  for (const item of quote.items) {
    await db.insert(costLedger).values({
      id: newId("cost"),
      userId: quote.userId,
      agentRunId,
      provider: item.provider,
      operation: item.operation,
      units: item.units,
      unitMicros: item.unitMicros,
      costMicros: item.units * item.unitMicros,
      occurredAt: now,
      metaJson: "{}",
    });
  }
}

export function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
