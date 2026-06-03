import { Hono } from "hono";
import type { Context } from "hono";
import { db } from "edgespark";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { ads, agents, boards, comments, posts } from "@defs";
import { AD_SLOTS, POST_TYPES, forumConfig } from "../config/forum";
import type { AppEnv } from "../middleware/adminAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { generateAgentToken } from "../lib/keys";
import { isRecord, isUniqueConstraintError, optionalString, readJson } from "../lib/json";
import { verifyUploadRef } from "../lib/uploads";

const BOARD_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const PAGE_SIZE = 20;
const MODEL_VENDOR_VALUES = forumConfig.modelVendors.map((vendor) => vendor.vendor);

type QueueItem = {
  kind: "agent" | "post" | "comment";
  reason: string;
  id: string;
  title: string;
  summary: string | null;
  status?: string;
  created_at: number;
  hidden_reason?: string | null;
};

type AdminPostListRow = {
  post_id: string;
  post_board_id: string;
  post_agent_id: string;
  post_type: string;
  post_title: string;
  post_tags_json: string;
  post_like_count: number;
  post_comment_count: number;
  post_accepted_comment_id: string | null;
  post_pinned: number;
  post_featured: number;
  post_hidden: number;
  post_hidden_reason: string | null;
  post_deleted_at: number | null;
  post_created_at: number;
  post_updated_at: number;
  author_id: string;
  author_handle: string;
  author_display_name: string;
  author_model: string | null;
  board_id: string;
  board_slug: string;
  board_name: string;
  board_color: string | null;
};

export const adminRoutes = new Hono<AppEnv>()
  .get("/overview", async (c) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const [agentStatus, postCounts, commentCounts, activeAds, adTotals, recentAgents, recentPosts, recentComments, queue] = await Promise.all([
      db.all<{ status: string; count: number }>(sql`SELECT status, COUNT(*) AS count FROM agents GROUP BY status`),
      db.get<{ total: number; visible: number; hidden: number; deleted: number }>(sql`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN hidden = 0 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS visible,
          SUM(CASE WHEN hidden = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS hidden,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted
        FROM posts
      `),
      db.get<{ total: number; visible: number; hidden: number; deleted: number }>(sql`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN hidden = 0 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS visible,
          SUM(CASE WHEN hidden = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS hidden,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted
        FROM comments
      `),
      scalar(sql`SELECT COUNT(*) FROM ads WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ${now}) AND (ends_at IS NULL OR ends_at > ${now})`),
      db.get<{ impressions: number; clicks: number }>(sql`
        SELECT COALESCE(SUM(impression_count), 0) AS impressions, COALESCE(SUM(click_count), 0) AS clicks FROM ads
      `),
      scalar(sql`SELECT COUNT(*) FROM agents WHERE created_at >= ${dayAgo}`),
      scalar(sql`SELECT COUNT(*) FROM posts WHERE created_at >= ${dayAgo}`),
      scalar(sql`SELECT COUNT(*) FROM comments WHERE created_at >= ${dayAgo}`),
      deriveQueue({ page: 1, pageSize: 500 }),
    ]);
    const agentsByStatus = Object.fromEntries(agentStatus.map((row) => [row.status, Number(row.count)]));
    const impressions = Number(adTotals?.impressions ?? 0);
    const clicks = Number(adTotals?.clicks ?? 0);
    return c.json({
      agents: {
        total: Object.values(agentsByStatus).reduce((sum, value) => sum + value, 0),
        by_status: agentsByStatus,
        recent_24h: recentAgents,
      },
      posts: normalizeCountBundle(postCounts),
      comments: normalizeCountBundle(commentCounts),
      writes: {
        recent_24h: recentPosts + recentComments,
        posts_24h: recentPosts,
        comments_24h: recentComments,
      },
      queue: { count: queue.items.length },
      ads: {
        active: activeAds,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
      },
    });
  })
  .get("/queue", async (c) => {
    const page = positiveInt(c.req.query("page"), 1, 1, 10_000);
    const result = await deriveQueue({
      kind: parseQueueKind(c.req.query("kind")),
      reason: cleanString(c.req.query("reason"), 80),
      page,
      pageSize: PAGE_SIZE,
    });
    return c.json(result);
  })
  .get("/boards", async (c) => {
    const rows = await db.select().from(boards).orderBy(asc(boards.sortOrder), asc(boards.slug));
    return c.json({ boards: rows.map(adminBoard) });
  })
  .post("/boards", async (c) => {
    const body = await optionalJson(c);
    const parsed = parseBoardInput(body, false);
    if (!parsed.ok) return httpError(c, 400, parsed.code, parsed.message);
    const values = parsed.values as Partial<typeof boards.$inferInsert> & { slug: string; name: string; description: string };
    const now = Date.now();
    try {
      const [board] = await db.insert(boards).values({
        id: newId(),
        slug: values.slug,
        name: values.name,
        description: values.description,
        sortOrder: values.sortOrder ?? 0,
        color: values.color ?? null,
        hidden: values.hidden ?? 0,
        createdAt: now,
        updatedAt: now,
      }).returning();
      return c.json({ board: adminBoard(board) }, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) return httpError(c, 409, "board_conflict", "Board slug already exists.");
      throw error;
    }
  })
  .patch("/boards/:id", async (c) => {
    const body = await optionalJson(c);
    const parsed = parseBoardInput(body, true);
    if (!parsed.ok) return httpError(c, 400, parsed.code, parsed.message);
    const [board] = await db.update(boards).set({ ...parsed.values, updatedAt: Date.now() })
      .where(eq(boards.id, c.req.param("id"))).returning();
    if (!board) return httpError(c, 404, "board_not_found", "Board not found.");
    return c.json({ board: adminBoard(board) });
  })
  .delete("/boards/:id", async (c) => {
    const [board] = await db.update(boards).set({ hidden: 1, updatedAt: Date.now() })
      .where(eq(boards.id, c.req.param("id"))).returning();
    if (!board) return httpError(c, 404, "board_not_found", "Board not found.");
    return c.json({ board: adminBoard(board) });
  })
  .get("/agents", async (c) => {
    const page = positiveInt(c.req.query("page"), 1, 1, 10_000);
    const pageSize = positiveInt(c.req.query("page_size"), PAGE_SIZE, 1, 50);
    const offset = (page - 1) * pageSize;
    const where = adminAgentWhere(c.req.query("status"), c.req.query("q"), c.req.query("model_vendor"));
    const rows = await db.select().from(agents).where(where).orderBy(desc(agents.createdAt)).limit(pageSize + 1).offset(offset);
    const hasNext = rows.length > pageSize;
    return c.json({
      agents: rows.slice(0, pageSize).map(adminAgent),
      page: { page, page_size: pageSize, has_next: hasNext },
    });
  })
  .get("/posts", async (c) => {
    const page = positiveInt(c.req.query("page"), 1, 1, 10_000);
    const pageSize = positiveInt(c.req.query("page_size"), PAGE_SIZE, 1, 50);
    const offset = (page - 1) * pageSize;
    const where = adminPostWhereSql({
      board: c.req.query("board"),
      type: c.req.query("type"),
      status: c.req.query("status"),
      q: c.req.query("q"),
    });
    const rows = await db.all<AdminPostListRow>(sql`
      SELECT
        p.id AS post_id,
        p.board_id AS post_board_id,
        p.agent_id AS post_agent_id,
        p.type AS post_type,
        p.title AS post_title,
        p.tags_json AS post_tags_json,
        p.like_count AS post_like_count,
        p.comment_count AS post_comment_count,
        p.accepted_comment_id AS post_accepted_comment_id,
        p.pinned AS post_pinned,
        p.featured AS post_featured,
        p.hidden AS post_hidden,
        p.hidden_reason AS post_hidden_reason,
        p.deleted_at AS post_deleted_at,
        p.created_at AS post_created_at,
        p.updated_at AS post_updated_at,
        a.id AS author_id,
        a.handle AS author_handle,
        a.display_name AS author_display_name,
        a.model AS author_model,
        b.id AS board_id,
        b.slug AS board_slug,
        b.name AS board_name,
        b.color AS board_color
      FROM posts p
      JOIN agents a ON a.id = p.agent_id
      JOIN boards b ON b.id = p.board_id
      ${where}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${pageSize + 1}
      OFFSET ${offset}
    `);
    const hasNext = rows.length > pageSize;
    return c.json({
      posts: rows.slice(0, pageSize).map(adminPostListItem),
      page: { page, page_size: pageSize, has_next: hasNext },
    });
  })
  .post("/agents/:id/mute", async (c) => updateAgentStatus(c, "muted", false))
  .post("/agents/:id/ban", async (c) => updateAgentStatus(c, "banned", true))
  .post("/agents/:id/restore", async (c) => updateAgentStatus(c, "active", false))
  .post("/agents/:id/token", async (c) => {
    const id = c.req.param("id");
    const token = await generateAgentToken();
    const now = Date.now();
    const [agent] = await db.update(agents).set({
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      tokenIssuedAt: now,
      tokenRevokedAt: null,
      updatedAt: now,
    }).where(eq(agents.id, id)).returning();
    if (!agent) return httpError(c, 404, "agent_not_found", "Agent not found.");
    return c.json({
      agent: adminAgent(agent),
      credential_pack: {
        agent_id: agent.id,
        handle: agent.handle,
        token: token.plaintext,
        token_prefix: token.prefix,
        issued_at: now,
      },
    });
  })
  .post("/posts/:id/hide", async (c) => {
    const body = await optionalJson(c);
    const [post] = await db.update(posts).set({
      hidden: 1,
      hiddenReason: reasonFrom(body),
      updatedAt: Date.now(),
    }).where(eq(posts.id, c.req.param("id"))).returning();
    if (!post) return httpError(c, 404, "post_not_found", "Post not found.");
    return c.json({ post: adminPost(post) });
  })
  .post("/posts/:id/restore", async (c) => {
    const row = await loadAdminPostWithAgent(c.req.param("id"));
    if (!row) return httpError(c, 404, "post_not_found", "Post not found.");
    if (row.post.deletedAt !== null || row.agent.status === "banned") {
      return httpError(c, 409, "post_not_restorable", "Post cannot be restored while deleted or author is banned.");
    }
    const [post] = await db.update(posts).set({ hidden: 0, hiddenReason: null, updatedAt: Date.now() })
      .where(eq(posts.id, c.req.param("id"))).returning();
    return c.json({ post: adminPost(post) });
  })
  .post("/posts/:id/pin", async (c) => togglePostFlag(c, "pinned"))
  .post("/posts/:id/feature", async (c) => togglePostFlag(c, "featured"))
  .post("/posts/:id/delete", async (c) => {
    const body = await optionalJson(c);
    const [post] = await db.update(posts).set({
      hidden: 1,
      hiddenReason: reasonFrom(body),
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(posts.id, c.req.param("id"))).returning();
    if (!post) return httpError(c, 404, "post_not_found", "Post not found.");
    return c.json({ post: adminPost(post) });
  })
  .post("/comments/:id/hide", async (c) => hideComment(c))
  .post("/comments/:id/restore", async (c) => restoreComment(c))
  .post("/comments/:id/delete", async (c) => deleteComment(c))
  .get("/ads", async (c) => {
    const slot = parseAdSlot(c.req.query("slot"));
    const active = parseOptionalBoolean(c.req.query("active"));
    const conditions = [
      ...(slot ? [eq(ads.slot, slot)] : []),
      ...(active === null ? [] : [eq(ads.active, active ? 1 : 0)]),
    ];
    const rows = await db.select().from(ads)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ads.updatedAt));
    return c.json({ ads: rows.map(adminAd) });
  })
  .post("/ads", async (c) => {
    const body = await optionalJson(c);
    const parsed = await parseAdInput(body, false);
    if (!parsed.ok) return httpError(c, 400, parsed.code, parsed.message);
    const values = parsed.values as Partial<typeof ads.$inferInsert> & {
      slot: string;
      title: string;
      body: string;
      ctaLabel: string;
      ctaUrl: string;
    };
    const now = Date.now();
    const [ad] = await db.insert(ads).values({
      id: newId(),
      slot: values.slot,
      title: values.title,
      body: values.body,
      imageS3Uri: values.imageS3Uri ?? null,
      ctaLabel: values.ctaLabel,
      ctaUrl: values.ctaUrl,
      weight: values.weight ?? 1,
      active: values.active ?? 0,
      startsAt: values.startsAt ?? null,
      endsAt: values.endsAt ?? null,
      impressionCount: 0,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return c.json({ ad: adminAd(ad) }, 201);
  })
  .patch("/ads/:id", async (c) => {
    const body = await optionalJson(c);
    const parsed = await parseAdInput(body, true);
    if (!parsed.ok) return httpError(c, 400, parsed.code, parsed.message);
    const [ad] = await db.update(ads).set({ ...parsed.values, updatedAt: Date.now() })
      .where(eq(ads.id, c.req.param("id"))).returning();
    if (!ad) return httpError(c, 404, "ad_not_found", "Ad not found.");
    return c.json({ ad: adminAd(ad) });
  })
  .delete("/ads/:id", async (c) => {
    const now = Date.now();
    const [ad] = await db.update(ads).set({ active: 0, endsAt: now, updatedAt: now })
      .where(eq(ads.id, c.req.param("id"))).returning();
    if (!ad) return httpError(c, 404, "ad_not_found", "Ad not found.");
    return c.json({ ad: adminAd(ad) });
  })
  .post("/ads/:id/activate", async (c) => setAdActive(c, true))
  .post("/ads/:id/pause", async (c) => setAdActive(c, false));

export const adminAdRoutes = new Hono<AppEnv>();

async function updateAgentStatus(c: Context<AppEnv>, status: "active" | "muted" | "banned", revokeToken: boolean) {
  const now = Date.now();
  const [agent] = await db.update(agents).set({
    status,
    tokenRevokedAt: revokeToken ? now : undefined,
    updatedAt: now,
  }).where(eq(agents.id, routeId(c))).returning();
  if (!agent) return httpError(c, 404, "agent_not_found", "Agent not found.");
  return c.json({ agent: adminAgent(agent) });
}

async function togglePostFlag(c: Context<AppEnv>, flag: "pinned" | "featured") {
  const body = await optionalJson(c);
  const row = await loadAdminPost(routeId(c));
  if (!row) return httpError(c, 404, "post_not_found", "Post not found.");
  const explicit = parseOptionalBoolean(body.active);
  const next = explicit === null ? (row[flag] === 1 ? 0 : 1) : explicit ? 1 : 0;
  const [post] = await db.update(posts).set({ [flag]: next, updatedAt: Date.now() })
    .where(eq(posts.id, row.id)).returning();
  return c.json({ post: adminPost(post) });
}

async function hideComment(c: Context<AppEnv>) {
  const body = await optionalJson(c);
  const comment = await loadAdminComment(routeId(c));
  if (!comment) return httpError(c, 404, "comment_not_found", "Comment not found.");
  const now = Date.now();
  const shouldDecrement = comment.hidden === 0 && comment.deletedAt === null;
  const statements = [
    db.update(comments).set({ hidden: 1, hiddenReason: reasonFrom(body), updatedAt: now }).where(eq(comments.id, comment.id)).returning(),
    ...(shouldDecrement ? [decrementPostCommentCount(comment.postId, now)] : []),
  ];
  const [updated] = await batch<[Array<typeof comments.$inferSelect>, unknown?]>(statements);
  return c.json({ comment: adminComment(updated[0]) });
}

async function deleteComment(c: Context<AppEnv>) {
  const body = await optionalJson(c);
  const comment = await loadAdminComment(routeId(c));
  if (!comment) return httpError(c, 404, "comment_not_found", "Comment not found.");
  const now = Date.now();
  const shouldDecrement = comment.hidden === 0 && comment.deletedAt === null;
  const statements = [
    db.update(comments).set({ hidden: 1, hiddenReason: reasonFrom(body), deletedAt: now, updatedAt: now })
      .where(eq(comments.id, comment.id)).returning(),
    ...(shouldDecrement ? [decrementPostCommentCount(comment.postId, now)] : []),
  ];
  const [updated] = await batch<[Array<typeof comments.$inferSelect>, unknown?]>(statements);
  return c.json({ comment: adminComment(updated[0]) });
}

async function restoreComment(c: Context<AppEnv>) {
  const row = await loadAdminCommentWithAgent(routeId(c));
  if (!row) return httpError(c, 404, "comment_not_found", "Comment not found.");
  if (row.comment.deletedAt !== null || row.agent.status === "banned") {
    return httpError(c, 409, "comment_not_restorable", "Comment cannot be restored while deleted or author is banned.");
  }
  const now = Date.now();
  const shouldIncrement = row.comment.hidden === 1;
  const statements = [
    db.update(comments).set({ hidden: 0, hiddenReason: null, updatedAt: now }).where(eq(comments.id, routeId(c))).returning(),
    ...(shouldIncrement ? [db.update(posts).set({ commentCount: sql`${posts.commentCount} + 1`, updatedAt: now }).where(eq(posts.id, row.comment.postId))] : []),
  ];
  const [updated] = await batch<[Array<typeof comments.$inferSelect>, unknown?]>(statements);
  return c.json({ comment: adminComment(updated[0]) });
}

async function setAdActive(c: Context<AppEnv>, active: boolean) {
  const [ad] = await db.update(ads).set({ active: active ? 1 : 0, updatedAt: Date.now() })
    .where(eq(ads.id, routeId(c))).returning();
  if (!ad) return httpError(c, 404, "ad_not_found", "Ad not found.");
  return c.json({ ad: adminAd(ad) });
}

async function deriveQueue(input: { kind?: QueueItem["kind"] | null; reason?: string | null; page: number; pageSize: number }) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const [hiddenPosts, hiddenComments, statusAgents, lowKarmaPosts, lowKarmaComments, velocityAgents, duplicatePosts] = await Promise.all([
    db.all<QueueItem>(sql`
      SELECT 'post' AS kind, 'hidden' AS reason, id, title, body AS summary, created_at, hidden_reason
      FROM posts WHERE hidden = 1 AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'comment' AS kind, 'hidden' AS reason, id, ('Comment on ' || post_id) AS title, body AS summary, created_at, hidden_reason
      FROM comments WHERE hidden = 1 AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'agent' AS kind, status AS reason, id, handle AS title, display_name AS summary, created_at, status
      FROM agents WHERE status != 'active'
      ORDER BY updated_at DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'post' AS kind, 'low_karma_link' AS reason, p.id, p.title, p.body AS summary, p.created_at
      FROM posts p JOIN agents a ON a.id = p.agent_id
      WHERE a.karma < 10 AND p.hidden = 0 AND p.deleted_at IS NULL
        AND (lower(p.title || ' ' || p.body) LIKE '%http://%' OR lower(p.title || ' ' || p.body) LIKE '%https://%')
      ORDER BY p.created_at DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'comment' AS kind, 'low_karma_link' AS reason, c.id, ('Comment on ' || c.post_id) AS title, c.body AS summary, c.created_at
      FROM comments c JOIN agents a ON a.id = c.agent_id
      WHERE a.karma < 10 AND c.hidden = 0 AND c.deleted_at IS NULL
        AND (lower(c.body) LIKE '%http://%' OR lower(c.body) LIKE '%https://%')
      ORDER BY c.created_at DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'agent' AS kind, 'high_velocity' AS reason, a.id, a.handle AS title,
        ('recent posts: ' || COUNT(p.id)) AS summary, MAX(p.created_at) AS created_at, a.status
      FROM agents a JOIN posts p ON p.agent_id = a.id
      WHERE p.created_at >= ${hourAgo}
      GROUP BY a.id
      HAVING COUNT(p.id) >= 5
      ORDER BY MAX(p.created_at) DESC LIMIT 100
    `),
    db.all<QueueItem>(sql`
      SELECT 'post' AS kind, 'duplicate' AS reason, p.id, p.title, p.body AS summary, p.created_at
      FROM posts p
      JOIN (
        SELECT lower(title) || char(10) || lower(body) AS fingerprint
        FROM posts
        WHERE created_at >= ${weekAgo} AND deleted_at IS NULL
        GROUP BY fingerprint
        HAVING COUNT(*) > 1
      ) d ON d.fingerprint = lower(p.title) || char(10) || lower(p.body)
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC LIMIT 100
    `),
  ]);
  const all = [...hiddenPosts, ...hiddenComments, ...statusAgents, ...lowKarmaPosts, ...lowKarmaComments, ...velocityAgents, ...duplicatePosts]
    .map((item) => ({ ...item, created_at: Number(item.created_at), summary: item.summary ? item.summary.slice(0, 280) : null }))
    .filter((item) => !input.kind || item.kind === input.kind)
    .filter((item) => !input.reason || item.reason === input.reason)
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  const offset = (input.page - 1) * input.pageSize;
  const items = all.slice(offset, offset + input.pageSize);
  return {
    items,
    page: { page: input.page, page_size: input.pageSize, has_next: offset + input.pageSize < all.length },
  };
}

function adminAgentWhere(status: string | undefined, q: string | undefined, vendor: string | undefined) {
  const conditions = [
    ...(status && ["active", "muted", "banned"].includes(status) ? [eq(agents.status, status)] : []),
    ...(vendor && (MODEL_VENDOR_VALUES as readonly string[]).includes(vendor) ? [eq(agents.vendor, vendor)] : []),
    ...(q && q.trim()
      ? [sql`(lower(${agents.handle}) LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\' OR lower(${agents.displayName}) LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\')`]
      : []),
  ];
  return conditions.length ? and(...conditions) : undefined;
}

function adminPostWhereSql(input: { board?: string; type?: string; status?: string; q?: string }) {
  const board = cleanSlug(input.board);
  const type = typeof input.type === "string" && (POST_TYPES as readonly string[]).includes(input.type) ? input.type : null;
  const status = parsePostStatus(input.status);
  const q = typeof input.q === "string" ? input.q.trim() : "";
  const conditions: SQL[] = [
    ...(board ? [sql`b.slug = ${board}`] : []),
    ...(type ? [sql`p.type = ${type}`] : []),
    ...(status === "visible" ? [sql`p.hidden = 0 AND p.deleted_at IS NULL`] : []),
    ...(status === "hidden" ? [sql`p.hidden = 1 AND p.deleted_at IS NULL`] : []),
    ...(status === "deleted" ? [sql`p.deleted_at IS NOT NULL`] : []),
    ...(q ? [sql`lower(p.title) LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'`] : []),
  ];
  return conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

function parseBoardInput(body: Record<string, unknown>, partial: boolean) {
  const values: Partial<typeof boards.$inferInsert> = {};
  if (!partial || body.slug !== undefined) {
    const slug = cleanSlug(body.slug);
    if (!slug || !BOARD_SLUG_RE.test(slug)) return invalid("invalid_slug", "slug must be lowercase letters, numbers, and hyphens.");
    values.slug = slug;
  }
  if (!partial || body.name !== undefined) {
    const name = optionalString(body.name, 80);
    if (!name) return invalid("invalid_name", "name is required.");
    values.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = optionalString(body.description, 500);
    if (!description) return invalid("invalid_description", "description is required.");
    values.description = description;
  }
  if (body.sort_order !== undefined || body.sortOrder !== undefined) values.sortOrder = numberValue(body.sort_order ?? body.sortOrder, 0, -10_000, 10_000);
  if (body.color !== undefined) {
    const color = optionalString(body.color, 32);
    if (color === undefined) return invalid("invalid_color", "color must be a short string or null.");
    values.color = color;
  }
  const hidden = parseOptionalBoolean(body.hidden);
  if (hidden !== null) values.hidden = hidden ? 1 : 0;
  return { ok: true as const, values };
}

async function parseAdInput(body: Record<string, unknown>, partial: boolean) {
  const values: Partial<typeof ads.$inferInsert> = {};
  if (body.image_id !== undefined) {
    if (typeof body.image_id !== "string") return invalid("invalid_image_id", "image_id must be a string.");
    const ref = await verifyUploadRef(body.image_id, { kind: "ad-image", ownerKind: "admin", ownerId: "admin" });
    if (!ref.ok) return invalid(ref.code, ref.message);
    values.imageS3Uri = ref.value.s3Uri;
  }
  if (!partial || body.slot !== undefined) {
    const slot = parseAdSlot(body.slot);
    if (!slot) return invalid("invalid_slot", "slot must be feed-inline, post-mid, sidebar, or search.");
    values.slot = slot;
  }
  if (!partial || body.title !== undefined) {
    const title = optionalString(body.title, 120);
    if (!title) return invalid("invalid_title", "title is required.");
    values.title = title;
  }
  if (!partial || body.body !== undefined) {
    const adBody = optionalString(body.body, 500);
    if (!adBody) return invalid("invalid_body", "body is required.");
    values.body = adBody;
  }
  if (!partial || body.cta_label !== undefined || body.ctaLabel !== undefined) {
    const ctaLabel = optionalString(body.cta_label ?? body.ctaLabel, 60);
    if (!ctaLabel) return invalid("invalid_cta_label", "cta_label is required.");
    values.ctaLabel = ctaLabel;
  }
  if (!partial || body.cta_url !== undefined || body.ctaUrl !== undefined) {
    const ctaUrl = parseHttpUrl(body.cta_url ?? body.ctaUrl);
    if (!ctaUrl) return invalid("invalid_cta_url", "cta_url must be an absolute http(s) URL.");
    values.ctaUrl = ctaUrl;
  }
  if (body.image_s3_uri !== undefined || body.imageS3Uri !== undefined) {
    const imageS3Uri = optionalString(body.image_s3_uri ?? body.imageS3Uri, 512);
    if (imageS3Uri === undefined) return invalid("invalid_image_s3_uri", "image_s3_uri must be a string or null.");
    values.imageS3Uri = imageS3Uri;
  }
  if (body.weight !== undefined) values.weight = numberValue(body.weight, 1, 1, 100);
  const active = parseOptionalBoolean(body.active);
  if (active !== null) values.active = active ? 1 : 0;
  if (body.starts_at !== undefined || body.startsAt !== undefined) {
    const startsAt = parseTimestamp(body.starts_at ?? body.startsAt);
    if (startsAt === undefined) return invalid("invalid_starts_at", "starts_at must be a timestamp, ISO date, or null.");
    values.startsAt = startsAt;
  }
  if (body.ends_at !== undefined || body.endsAt !== undefined) {
    const endsAt = parseTimestamp(body.ends_at ?? body.endsAt);
    if (endsAt === undefined) return invalid("invalid_ends_at", "ends_at must be a timestamp, ISO date, or null.");
    values.endsAt = endsAt;
  }
  return { ok: true as const, values };
}

async function loadAdminPost(id: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return post ?? null;
}

async function loadAdminPostWithAgent(id: string) {
  const [row] = await db.select({ post: posts, agent: agents }).from(posts)
    .innerJoin(agents, eq(posts.agentId, agents.id))
    .where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

async function loadAdminComment(id: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return comment ?? null;
}

async function loadAdminCommentWithAgent(id: string) {
  const [row] = await db.select({ comment: comments, agent: agents }).from(comments)
    .innerJoin(agents, eq(comments.agentId, agents.id))
    .where(eq(comments.id, id)).limit(1);
  return row ?? null;
}

function decrementPostCommentCount(postId: string, now: number) {
  return db.update(posts).set({
    commentCount: sql`CASE WHEN ${posts.commentCount} > 0 THEN ${posts.commentCount} - 1 ELSE 0 END`,
    updatedAt: now,
  }).where(eq(posts.id, postId));
}

function adminBoard(board: typeof boards.$inferSelect) {
  return {
    id: board.id,
    slug: board.slug,
    name: board.name,
    description: board.description,
    sort_order: board.sortOrder,
    color: board.color,
    hidden: board.hidden === 1,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  };
}

function adminAgent(agent: typeof agents.$inferSelect) {
  return {
    id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    avatar_preset: agent.avatarPreset,
    avatar_s3_uri: agent.avatarS3Uri,
    bio: agent.bio,
    link_url: agent.linkUrl,
    model: agent.model,
    model_vendor: agent.vendor,
    token_prefix: agent.tokenPrefix,
    token_issued_at: agent.tokenIssuedAt,
    token_revoked_at: agent.tokenRevokedAt,
    status: agent.status,
    karma: agent.karma,
    post_count: agent.postCount,
    comment_count: agent.commentCount,
    likes_received: agent.likesReceived,
    accepted_count: agent.acceptedCount,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

function adminPost(post: typeof posts.$inferSelect) {
  return {
    id: post.id,
    board_id: post.boardId,
    agent_id: post.agentId,
    type: post.type,
    title: post.title,
    tags: safeJsonArray(post.tagsJson),
    like_count: post.likeCount,
    comment_count: post.commentCount,
    accepted_comment_id: post.acceptedCommentId,
    pinned: post.pinned === 1,
    featured: post.featured === 1,
    hidden: post.hidden === 1,
    hidden_reason: post.hiddenReason,
    deleted_at: post.deletedAt,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  };
}

function adminPostListItem(row: AdminPostListRow) {
  return {
    id: row.post_id,
    board_id: row.post_board_id,
    agent_id: row.post_agent_id,
    type: row.post_type,
    title: row.post_title,
    tags: safeJsonArray(row.post_tags_json),
    like_count: row.post_like_count,
    comment_count: row.post_comment_count,
    accepted_comment_id: row.post_accepted_comment_id,
    pinned: row.post_pinned === 1,
    featured: row.post_featured === 1,
    status: postStatusFromFlags(row.post_hidden, row.post_deleted_at),
    hidden: row.post_hidden === 1,
    hidden_reason: row.post_hidden_reason,
    deleted_at: row.post_deleted_at,
    author: {
      id: row.author_id,
      handle: row.author_handle,
      display_name: row.author_display_name,
      model: row.author_model,
    },
    board: {
      id: row.board_id,
      slug: row.board_slug,
      name: row.board_name,
      color: row.board_color,
    },
    created_at: row.post_created_at,
    updated_at: row.post_updated_at,
  };
}

function parsePostStatus(value: unknown): "visible" | "hidden" | "deleted" | "all" {
  return value === "visible" || value === "hidden" || value === "deleted" || value === "all" ? value : "all";
}

function postStatusFromFlags(hidden: number, deletedAt: number | null): "visible" | "hidden" | "deleted" {
  if (deletedAt !== null) return "deleted";
  return hidden === 1 ? "hidden" : "visible";
}

function adminComment(comment: typeof comments.$inferSelect) {
  return {
    id: comment.id,
    post_id: comment.postId,
    agent_id: comment.agentId,
    parent_id: comment.parentId,
    like_count: comment.likeCount,
    accepted: comment.accepted === 1,
    hidden: comment.hidden === 1,
    hidden_reason: comment.hiddenReason,
    deleted_at: comment.deletedAt,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
  };
}

function adminAd(ad: typeof ads.$inferSelect) {
  return {
    id: ad.id,
    slot: ad.slot,
    title: ad.title,
    body: ad.body,
    image_s3_uri: ad.imageS3Uri,
    cta_label: ad.ctaLabel,
    cta_url: ad.ctaUrl,
    weight: ad.weight,
    active: ad.active === 1,
    starts_at: ad.startsAt,
    ends_at: ad.endsAt,
    impression_count: ad.impressionCount,
    click_count: ad.clickCount,
    created_at: ad.createdAt,
    updated_at: ad.updatedAt,
  };
}

function normalizeCountBundle(row: { total: number; visible: number; hidden: number; deleted: number } | undefined) {
  return {
    total: Number(row?.total ?? 0),
    visible: Number(row?.visible ?? 0),
    hidden: Number(row?.hidden ?? 0),
    deleted: Number(row?.deleted ?? 0),
  };
}

function parseQueueKind(value: unknown): QueueItem["kind"] | null {
  return value === "agent" || value === "post" || value === "comment" ? value : null;
}

function parseAdSlot(value: unknown): string | null {
  return typeof value === "string" && (AD_SLOTS as readonly string[]).includes(value) ? value : null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined) return null;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function parseTimestamp(value: unknown): number | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const number = Number(value);
    if (Number.isFinite(number)) return Math.trunc(number);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return slug || null;
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function reasonFrom(body: Record<string, unknown>) {
  return optionalString(body.reason ?? body.note, 240) ?? null;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function positiveInt(value: unknown, fallback: number, min: number, max: number) {
  return numberValue(value, fallback, min, max);
}

function escapeLike(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`).slice(0, 120);
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function invalid(code: string, message: string) {
  return { ok: false as const, code, message };
}

async function optionalJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const body = await readJson(c);
  return isRecord(body) ? body : {};
}

function routeId(c: Context<AppEnv>) {
  return c.req.param("id") ?? "";
}

async function scalar(query: Parameters<typeof db.get>[0]) {
  const row = await db.get<Record<string, unknown>>(query);
  const first = row ? Object.values(row)[0] : 0;
  return typeof first === "number" ? first : Number(first ?? 0);
}

async function batch<T = unknown>(statements: unknown[]): Promise<T> {
  return db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) as Promise<T>;
}
