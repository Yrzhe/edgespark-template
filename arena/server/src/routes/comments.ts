import { Hono } from "hono";
import { auth } from "edgespark/http";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { comments, contestantTotals, contestants, voteBuckets } from "@defs";
import { encodeCursor, parseCursor } from "../lib/cursor";
import { heartsAwarded, parseMentionIds, safeMentions, sanitizeCommentText } from "../lib/comments";
import { dailyVoteStatement } from "../lib/daily";
import { httpError } from "../lib/httpErrors";
import { bucketStart, ensureCompetition, publicOriginFromHeaders } from "../lib/season";

export const commentsPublicRoutes = new Hono().get("/comments", async (c) => {
  const { db } = await import("edgespark");
  const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  const since = c.req.query("since");
  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseCursor(c.req.query("cursor"));
  const filters = [
    eq(comments.seasonId, comp.activeSeasonId),
    eq(comments.hidden, 0),
    since ? gt(comments.createdAt, Number(since) || 0) : undefined,
    !since && cursor ? or(lt(comments.createdAt, cursor.createdAt), and(eq(comments.createdAt, cursor.createdAt), lt(comments.id, cursor.id))) : undefined,
  ].filter(Boolean);
  const rows = await db
    .select()
    .from(comments)
    .where(and(...filters) as ReturnType<typeof sql>)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    comments: page.map(formatComment),
    nextCursor: since ? null : rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  });
});

export const commentsWriteRoutes = new Hono().post("/comments", async (c) => {
  if (!auth.user) return httpError(c, 401, "unauthorized", "Login required.");
  const body = await readJson(c.req.raw);
  if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON body required.");
  const text = sanitizeCommentText(body.text);
  if (!text) return httpError(c, 400, "invalid_text", "text is required.");
  const { db } = await import("edgespark");
  const comp = await ensureCompetition(publicOriginFromHeaders(c.req.raw.headers, c.req.url));
  if (comp.commentsEnabled !== 1 || comp.status === "ended") return c.json({ error: "NOT_LIVE" }, 403);
  if (comp.status !== "draft" && comp.status !== "live") return c.json({ error: "NOT_LIVE" }, 403);

  const mentioned = parseMentionIds(text);
  const validRows = mentioned.length
    ? await db.select({ id: contestants.id }).from(contestants).where(and(inArray(contestants.id, mentioned), eq(contestants.hidden, 0)))
    : [];
  const validIds = validRows.map((row) => row.id);
  const awardHearts = comp.status === "live";
  const awarded = awardHearts ? heartsAwarded(validIds) : {};
  const now = Date.now();
  const statements = [
    db.insert(comments).values({
      seasonId: comp.activeSeasonId,
      userId: auth.user.id,
      displayName: auth.user.name ?? auth.user.email ?? "Arena user",
      text,
      mentions: JSON.stringify(validIds),
      createdAt: now,
      hidden: 0,
    }).returning({ id: comments.id }),
    ...(awardHearts ? validIds.flatMap((contestantId) => [
      db.insert(voteBuckets).values({ seasonId: comp.activeSeasonId, contestantId, bucketStart: bucketStart(now), count: 10 })
        .onConflictDoUpdate({ target: [voteBuckets.seasonId, voteBuckets.contestantId, voteBuckets.bucketStart], set: { count: sql`${voteBuckets.count} + 10` } }),
      db.insert(contestantTotals).values({ seasonId: comp.activeSeasonId, contestantId, total: 10 })
        .onConflictDoUpdate({ target: [contestantTotals.seasonId, contestantTotals.contestantId], set: { total: sql`${contestantTotals.total} + 10` } }),
      dailyVoteStatement(db, comp.activeSeasonId, contestantId, 10, now),
    ]) : []),
  ];
  const results = await db.batch(statements as never);
  const [comment] = results[0] as Array<{ id: number }>;
  return c.json({ ok: true, id: comment.id, heartsAwarded: awarded });
});

export function formatComment(row: typeof comments.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    text: row.text,
    mentions: safeMentions(row.mentions),
    createdAt: row.createdAt,
  };
}

function parseLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : 30;
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 30;
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
