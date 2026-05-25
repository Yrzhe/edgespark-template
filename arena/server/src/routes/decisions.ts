import { Hono } from "hono";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { decisions } from "@defs";
import { encodeCursor, parseCursor } from "../lib/cursor";
import { groupDecisionsByMinute, type PublicDecision } from "../lib/decisions";
import { ensureCompetition, publicOriginFromHeaders } from "../lib/season";

export const decisionsRoutes = new Hono()
.get("/decisions/by-minute", async (c) => {
  const { db } = await import("edgespark");
  await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseCursor(c.req.query("cursor"));
  const where = cursor ? or(lt(decisions.createdAt, cursor.createdAt), and(eq(decisions.createdAt, cursor.createdAt), lt(decisions.id, cursor.id))) : undefined;
  const rows = await db
    .select({
      id: decisions.id,
      contestantId: decisions.contestantId,
      symbol: decisions.symbol,
      action: decisions.action,
      qty: decisions.qty,
      price: decisions.price,
      confidence: decisions.confidence,
      reasoning: decisions.reasoning,
      justification: decisions.justification,
      chainOfThought: decisions.chainOfThought,
      timestamp: decisions.timestamp,
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .where(where)
    .orderBy(desc(decisions.createdAt), desc(decisions.id))
    .limit(Math.max(100, limit * 50));
  const grouped = groupDecisionsByMinute(rows as PublicDecision[], limit);
  return c.json({
    minutes: grouped.minutes,
    nextCursor: rows.length > grouped.minutes.flatMap((m) => m.items).length && grouped.lastCursorSource
      ? encodeCursor(grouped.lastCursorSource.createdAt, grouped.lastCursorSource.id)
      : null,
  });
})
.get("/decisions", async (c) => {
  const { db } = await import("edgespark");
  await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseCursor(c.req.query("cursor"));
  const contestantId = c.req.query("contestantId");
  const filters = [
    contestantId ? eq(decisions.contestantId, contestantId) : undefined,
    cursor ? or(lt(decisions.createdAt, cursor.createdAt), and(eq(decisions.createdAt, cursor.createdAt), lt(decisions.id, cursor.id))) : undefined,
  ].filter(Boolean);
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  const rows = await db
    .select({
      id: decisions.id,
      contestantId: decisions.contestantId,
      symbol: decisions.symbol,
      action: decisions.action,
      qty: decisions.qty,
      price: decisions.price,
      confidence: decisions.confidence,
      reasoning: decisions.reasoning,
      justification: decisions.justification,
      chainOfThought: decisions.chainOfThought,
      timestamp: decisions.timestamp,
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .where(where as ReturnType<typeof sql> | undefined)
    .orderBy(desc(decisions.createdAt), desc(decisions.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    decisions: page.map(({ createdAt, ...row }) => row),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  });
});

function parseLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : 30;
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 30;
}
