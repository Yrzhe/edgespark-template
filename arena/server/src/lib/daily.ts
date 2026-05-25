import { and, asc, eq, sql } from "drizzle-orm";
import { dailyRollups } from "@defs";

export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function dailyVoteStatement(db: typeof import("edgespark").db, seasonId: string, contestantId: string, count: number, now: number) {
  return db
    .insert(dailyRollups)
    .values({ seasonId, contestantId, day: utcDay(now), votes: count, equityOpen: null, equityClose: null })
    .onConflictDoUpdate({
      target: [dailyRollups.seasonId, dailyRollups.contestantId, dailyRollups.day],
      set: { votes: sql`${dailyRollups.votes} + ${count}` },
    });
}

export function dailyEquityStatement(db: typeof import("edgespark").db, seasonId: string, contestantId: string, equity: number, now: number) {
  return db
    .insert(dailyRollups)
    .values({ seasonId, contestantId, day: utcDay(now), votes: 0, equityOpen: equity, equityClose: equity })
    .onConflictDoUpdate({
      target: [dailyRollups.seasonId, dailyRollups.contestantId, dailyRollups.day],
      set: {
        equityOpen: sql`coalesce(${dailyRollups.equityOpen}, ${equity})`,
        equityClose: equity,
      },
    });
}

export async function dailyRowsForContestant(seasonId: string, contestantId: string) {
  const { db } = await import("edgespark");
  return db
    .select()
    .from(dailyRollups)
    .where(and(eq(dailyRollups.seasonId, seasonId), eq(dailyRollups.contestantId, contestantId)))
    .orderBy(asc(dailyRollups.day));
}

export function formatDailyRows(rows: Array<typeof dailyRollups.$inferSelect>) {
  return rows.map((row) => ({
    day: row.day,
    votes: row.votes,
    equityClose: row.equityClose,
    dVotes: row.votes,
    dEquity: row.equityClose == null || row.equityOpen == null ? null : row.equityClose - row.equityOpen,
  }));
}
