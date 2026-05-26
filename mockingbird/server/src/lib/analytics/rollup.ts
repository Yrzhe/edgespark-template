import { dailyAnalyticsRollups, analyticsEvents } from "@defs";
import { db } from "edgespark";
import { and, eq, gte, lt } from "drizzle-orm";
import { newId } from "../ids";

export async function rollupDay(dayStart: number): Promise<{ rebuilt: number; skipped: number; errors: number }> {
  const dayEnd = dayStart + 24 * 60 * 60_000;
  const day = new Date(dayStart).toISOString().slice(0, 10);
  const rows = await db.select().from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, dayStart), lt(analyticsEvents.occurredAt, dayEnd)));
  const groups = new Map<string, { eventType: string; themeId: string | null; dimension: string; dimensionValue: string; count: number; tokenIn: number; tokenOut: number; costMicros: number }>();
  for (const row of rows) {
    for (const [dimension, value] of [["total", "all"], ["theme", row.themeId ?? "none"], ["country", row.country ?? "xx"], ["device", row.device ?? "unknown"], ["referrer", row.referrerRoot ?? "other"], ["language", row.langRoot ?? "xx"], ["hour_band", row.hourBand ?? "unknown"]] as const) {
      const key = `${row.eventType}:${row.themeId ?? ""}:${dimension}:${value}`;
      const group = groups.get(key) ?? { eventType: row.eventType, themeId: row.themeId, dimension, dimensionValue: value, count: 0, tokenIn: 0, tokenOut: 0, costMicros: 0 };
      group.count++;
      group.tokenIn += row.tokenIn;
      group.tokenOut += row.tokenOut;
      group.costMicros += row.costMicros;
      groups.set(key, group);
    }
  }
  await db.delete(dailyAnalyticsRollups).where(eq(dailyAnalyticsRollups.day, day));
  let rebuilt = 0;
  let errors = 0;
  for (const group of groups.values()) {
    try {
      await db.insert(dailyAnalyticsRollups).values({ id: newId(), day, ...group, updatedAt: Date.now() });
      rebuilt++;
    } catch {
      errors++;
    }
  }
  return { rebuilt, skipped: 0, errors };
}
