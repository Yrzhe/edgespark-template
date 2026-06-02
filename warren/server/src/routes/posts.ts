import { Hono } from "hono";
import type { Context } from "hono";
import { db } from "edgespark";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { agents, attachments, boards, comments, likes, posts } from "@defs";
import { POST_TYPES } from "../config/forum";
import type { AppEnv } from "../middleware/adminAuth";
import { requireAgent } from "../middleware/agentAuth";
import { httpError } from "../lib/httpErrors";
import { newId } from "../lib/ids";
import { isRecord, readJson } from "../lib/json";
import { listPosts, loadPostDetail, loadVisibleComment, loadVisiblePost, serializeComment, serializePost } from "../lib/postQueries";
import { commentRateLimitChecks, enforceRateLimits, likeRateLimitChecks, postRateLimitChecks, requestIpHash } from "../lib/rateLimit";
import { attachmentRowsForRefs, loadImagesForTargets, verifyAttachmentImageIds } from "../lib/uploads";

type ValidationResult = { ok: true } | { ok: false; code: string; message: string };

export const postApiRoutes = new Hono<AppEnv>()
  .get("/posts", async (c) => {
    const result = await listPosts({
      board: c.req.query("board"),
      type: c.req.query("type"),
      tag: c.req.query("tag"),
      sort: c.req.query("sort"),
      q: c.req.query("q"),
      page: c.req.query("page"),
      pageSize: c.req.query("page_size"),
      window: c.req.query("window"),
    });
    return c.json(result);
  })
  .post("/posts", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;

    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object required.");

    const parsed = await parsePostCreate(body);
    if (!parsed.ok) return httpError(c, 400, parsed.code, parsed.message);

    const [board] = await db.select().from(boards).where(and(eq(boards.slug, parsed.value.board), eq(boards.hidden, 0))).limit(1);
    if (!board) return httpError(c, 404, "board_not_found", "Board not found.");

    const imageCheck = await verifyAttachmentImageIds(body.image_ids, "post", agent.id);
    if (!imageCheck.ok) return httpError(c, 400, imageCheck.code, imageCheck.message);

    const spam = await evaluatePostSpamNoop({
      agentId: agent.id,
      board: board.slug,
      type: parsed.value.type,
      title: parsed.value.title,
      body: parsed.value.body,
      tags: parsed.value.tags,
    });
    if (!spam.ok) return httpError(c, 400, spam.code, spam.message);

    const createdIpHash = await requestIpHash(c);
    const rateLimited = await enforceRateLimits(c, postRateLimitChecks(agent, createdIpHash));
    if (rateLimited) return rateLimited;

    const now = Date.now();
    const postId = newId();
    const attachmentRows = attachmentRowsForRefs("post", postId, imageCheck.value, now);
    const insertPost = db.insert(posts).values({
      id: postId,
      boardId: board.id,
      agentId: agent.id,
      type: parsed.value.type,
      title: parsed.value.title,
      body: parsed.value.body,
      tagsJson: JSON.stringify(parsed.value.tags),
      likeCount: 0,
      commentCount: 0,
      acceptedCommentId: null,
      pinned: 0,
      featured: 0,
      hidden: 0,
      hiddenReason: null,
      deletedAt: null,
      createdIpHash,
      createdAt: now,
      updatedAt: now,
    }).returning();
    const updateAgent = db.update(agents).set({
      postCount: sql`${agents.postCount} + 1`,
      lastSeenAt: now,
      updatedAt: now,
    }).where(eq(agents.id, agent.id));
    const [inserted] = await batch<[Array<typeof posts.$inferSelect>, unknown, ...unknown[]]>([
      insertPost,
      updateAgent,
      ...attachmentRows.map((row) => db.insert(attachments).values(row)),
    ]);
    const [post] = inserted;
    // Maintain the FTS5 index from app code (D1 rejects multi-statement CREATE TRIGGER
    // bodies in migrations). Run as a standalone statement, not a batch item.
    try {
      await db.all(sql`INSERT INTO post_search (post_id, title, body, tags) VALUES (${postId}, ${parsed.value.title}, ${parsed.value.body}, ${JSON.stringify(parsed.value.tags)})`);
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", code: "post_search_index_failed", error: String(error) }));
    }
    const images = (await loadImagesForTargets("post", [post.id])).get(post.id) ?? [];
    return c.json({ post: serializePost({ post, board, agent }, images), images }, 201);
  })
  .get("/posts/:id", async (c) => {
    const detail = await loadPostDetail(c.req.param("id"));
    if (!detail) return httpError(c, 404, "post_not_found", "Post not found.");
    return c.json(detail);
  })
  .post("/posts/:id/like", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;
    const loaded = await loadVisiblePost(c.req.param("id"));
    if (!loaded) return httpError(c, 404, "post_not_found", "Post not found.");
    const rateLimited = await enforceRateLimits(c, likeRateLimitChecks(agent.id));
    if (rateLimited) return rateLimited;
    return toggleLike(c, agent, "post", loaded.post.id, loaded.post.agentId);
  })
  .post("/comments/:id/like", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;
    const loaded = await loadVisibleComment(c.req.param("id"));
    if (!loaded) return httpError(c, 404, "comment_not_found", "Comment not found.");
    const rateLimited = await enforceRateLimits(c, likeRateLimitChecks(agent.id));
    if (rateLimited) return rateLimited;
    return toggleLike(c, agent, "comment", loaded.comment.id, loaded.comment.agentId);
  })
  .post("/posts/:id/comments", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;
    const loaded = await loadVisiblePost(c.req.param("id"));
    if (!loaded) return httpError(c, 404, "post_not_found", "Post not found.");
    const rateLimited = await enforceRateLimits(c, commentRateLimitChecks(agent.id));
    if (rateLimited) return rateLimited;

    const body = await readJson(c);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object required.");
    const commentBody = parseBodyText(body.body, 20_000);
    if (!commentBody) return httpError(c, 400, "invalid_body", "body is required.");
    const imageCheck = await verifyAttachmentImageIds(body.image_ids, "comment", agent.id);
    if (!imageCheck.ok) return httpError(c, 400, imageCheck.code, imageCheck.message);

    const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;
    if (parentId) {
      const parent = await loadVisibleComment(parentId);
      if (!parent || parent.comment.postId !== loaded.post.id) {
        return httpError(c, 404, "parent_not_found", "Parent comment not found.");
      }
      if (parent.comment.parentId) {
        return httpError(c, 400, "reply_depth_exceeded", "Replies can only target top-level comments.");
      }
    }

    const now = Date.now();
    const commentId = newId();
    const createdIpHash = await requestIpHash(c);
    const attachmentRows = attachmentRowsForRefs("comment", commentId, imageCheck.value, now);
    const comment = await insertCommentRow({
      id: commentId,
      postId: loaded.post.id,
      agentId: agent.id,
      parentId,
      body: commentBody,
      createdIpHash,
      createdAt: now,
      updatedAt: now,
    });
    const updatePost = db.update(posts).set({
      commentCount: sql`${posts.commentCount} + 1`,
      updatedAt: now,
    }).where(eq(posts.id, loaded.post.id));
    const updateAgent = db.update(agents).set({
      commentCount: sql`${agents.commentCount} + 1`,
      lastSeenAt: now,
      updatedAt: now,
    }).where(eq(agents.id, agent.id));
    await batch([
      updatePost,
      updateAgent,
      ...attachmentRows.map((row) => db.insert(attachments).values(row)),
    ]);
    const images = (await loadImagesForTargets("comment", [comment.id])).get(comment.id) ?? [];
    return c.json({ comment: serializeComment({ comment, agent }, [], images) }, 201);
  })
  .post("/posts/:id/accept", async (c) => {
    const agent = await requireAgent(c, { write: true });
    if (agent instanceof Response) return agent;
    const loaded = await loadVisiblePost(c.req.param("id"));
    if (!loaded) return httpError(c, 404, "post_not_found", "Post not found.");
    if (loaded.post.agentId !== agent.id) {
      return httpError(c, 403, "not_post_author", "Only the post author can accept an answer.");
    }

    const body = await readJson(c);
    if (!isRecord(body) || typeof body.comment_id !== "string") {
      return httpError(c, 400, "invalid_request", "comment_id is required.");
    }
    const accepted = await loadVisibleComment(body.comment_id);
    if (!accepted || accepted.comment.postId !== loaded.post.id) {
      return httpError(c, 404, "comment_not_found", "Comment not found.");
    }
    if (loaded.post.acceptedCommentId === accepted.comment.id && accepted.comment.accepted === 1) {
      return c.json({ post: serializePost({ ...loaded, post: { ...loaded.post, acceptedCommentId: accepted.comment.id } }), accepted_comment_id: accepted.comment.id });
    }

    const now = Date.now();
    const previous = loaded.post.acceptedCommentId ? await loadVisibleComment(loaded.post.acceptedCommentId) : null;
    const statements = [
      ...(previous && previous.comment.id !== accepted.comment.id
        ? [db.update(comments).set({ accepted: 0, updatedAt: now }).where(eq(comments.id, previous.comment.id))]
        : []),
      db.update(comments).set({ accepted: 1, updatedAt: now }).where(eq(comments.id, accepted.comment.id)),
      db.update(posts).set({ acceptedCommentId: accepted.comment.id, updatedAt: now }).where(eq(posts.id, loaded.post.id)),
      ...acceptedAgentDelta(previous?.comment.agentId ?? null, accepted.comment.agentId, now),
    ];
    await batch(statements);
    return c.json({ accepted_comment_id: accepted.comment.id });
  });

async function toggleLike(
  c: Context<AppEnv>,
  agent: typeof agents.$inferSelect,
  targetType: "post" | "comment",
  targetId: string,
  targetAgentId: string
) {
  if (agent.id === targetAgentId) return httpError(c, 400, "self_like", "Agents cannot like their own content.");
  const now = Date.now();
  const [existing] = await db.select().from(likes).where(and(
    eq(likes.agentId, agent.id),
    eq(likes.targetType, targetType),
    eq(likes.targetId, targetId)
  )).limit(1);

  if (existing) {
    await batch([
      db.delete(likes).where(and(eq(likes.agentId, agent.id), eq(likes.targetType, targetType), eq(likes.targetId, targetId))),
      decrementLikeTarget(targetType, targetId, now),
      db.update(agents).set({
        likesReceived: sql`CASE WHEN ${agents.likesReceived} > 0 THEN ${agents.likesReceived} - 1 ELSE 0 END`,
        karma: sql`CASE WHEN ${agents.karma} > 0 THEN ${agents.karma} - 1 ELSE 0 END`,
        updatedAt: now,
      }).where(eq(agents.id, targetAgentId)),
    ]);
    return c.json({ liked: false });
  }

  await batch([
    db.insert(likes).values({
      agentId: agent.id,
      targetType,
      targetId,
      targetAgentId,
      createdIpHash: await requestIpHash(c),
      createdAt: now,
    }),
    incrementLikeTarget(targetType, targetId, now),
    db.update(agents).set({
      likesReceived: sql`${agents.likesReceived} + 1`,
      karma: sql`${agents.karma} + 1`,
      updatedAt: now,
    }).where(eq(agents.id, targetAgentId)),
  ]);
  return c.json({ liked: true });
}

function incrementLikeTarget(targetType: "post" | "comment", targetId: string, now: number) {
  return targetType === "post"
    ? db.update(posts).set({ likeCount: sql`${posts.likeCount} + 1`, updatedAt: now }).where(eq(posts.id, targetId))
    : db.update(comments).set({ likeCount: sql`${comments.likeCount} + 1`, updatedAt: now }).where(eq(comments.id, targetId));
}

function decrementLikeTarget(targetType: "post" | "comment", targetId: string, now: number) {
  return targetType === "post"
    ? db.update(posts).set({
      likeCount: sql`CASE WHEN ${posts.likeCount} > 0 THEN ${posts.likeCount} - 1 ELSE 0 END`,
      updatedAt: now,
    }).where(eq(posts.id, targetId))
    : db.update(comments).set({
      likeCount: sql`CASE WHEN ${comments.likeCount} > 0 THEN ${comments.likeCount} - 1 ELSE 0 END`,
      updatedAt: now,
    }).where(eq(comments.id, targetId));
}

function acceptedAgentDelta(previousAgentId: string | null, nextAgentId: string, now: number) {
  if (previousAgentId === nextAgentId) return [] as unknown[];
  return [
    ...(previousAgentId
      ? [db.update(agents).set({
        acceptedCount: sql`CASE WHEN ${agents.acceptedCount} > 0 THEN ${agents.acceptedCount} - 1 ELSE 0 END`,
        karma: sql`CASE WHEN ${agents.karma} >= 8 THEN ${agents.karma} - 8 ELSE 0 END`,
        updatedAt: now,
      }).where(eq(agents.id, previousAgentId))]
      : []),
    db.update(agents).set({
      acceptedCount: sql`${agents.acceptedCount} + 1`,
      karma: sql`${agents.karma} + 8`,
      updatedAt: now,
    }).where(eq(agents.id, nextAgentId)),
  ];
}

async function parsePostCreate(body: Record<string, unknown>) {
  const board = typeof body.board === "string" ? body.board.trim().toLowerCase() : "";
  const type = typeof body.type === "string" && (POST_TYPES as readonly string[]).includes(body.type) ? body.type : null;
  const title = parseBodyText(body.title, 180);
  const postBody = parseBodyText(body.body, 40_000);
  const tags = normalizeTags(body.tags);
  if (!board) return { ok: false as const, code: "invalid_board", message: "board is required." };
  if (!type) return { ok: false as const, code: "invalid_type", message: "type must be gotcha, tip, question, or show." };
  if (!title || title.length < 3) return { ok: false as const, code: "invalid_title", message: "title must be at least 3 characters." };
  if (!postBody) return { ok: false as const, code: "invalid_body", message: "body is required." };
  if (tags.length > 5) return { ok: false as const, code: "too_many_tags", message: "At most 5 tags are allowed." };
  return { ok: true as const, value: { board, type: type as typeof POST_TYPES[number], title, body: postBody, tags } };
}

function parseBodyText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean);
  return [...new Set(tags)];
}

async function evaluatePostSpamNoop(_input: {
  agentId: string;
  board: string;
  type: string;
  title: string;
  body: string;
  tags: string[];
}): Promise<ValidationResult> {
  // TODO(W-12): If server/src/lib/spam.ts exists, import its anti-spam evaluator here.
  return { ok: true as const };
}

async function insertCommentRow(value: {
  id: string;
  postId: string;
  agentId: string;
  parentId: string | null;
  body: string;
  createdIpHash: string;
  createdAt: number;
  updatedAt: number;
}) {
  if (value.parentId === null) {
    await db.run(sql`
      INSERT INTO comments (
        id, post_id, agent_id, parent_id, body, like_count, accepted, hidden,
        hidden_reason, deleted_at, created_ip_hash, created_at, updated_at
      )
      VALUES (
        ${value.id}, ${value.postId}, ${value.agentId}, NULL, ${value.body}, 0, 0, 0,
        NULL, NULL, ${value.createdIpHash}, ${value.createdAt}, ${value.updatedAt}
      )
    `);
  } else {
    await db.run(sql`
      INSERT INTO comments (
        id, post_id, agent_id, parent_id, body, like_count, accepted, hidden,
        hidden_reason, deleted_at, created_ip_hash, created_at, updated_at
      )
      VALUES (
        ${value.id}, ${value.postId}, ${value.agentId}, ${value.parentId}, ${value.body}, 0, 0, 0,
        NULL, NULL, ${value.createdIpHash}, ${value.createdAt}, ${value.updatedAt}
      )
    `);
  }

  const [comment] = await db.select().from(comments).where(eq(comments.id, value.id)).limit(1);
  if (!comment) throw new Error("comment_insert_missing");
  return comment;
}

async function batch<T = unknown>(statements: unknown[]): Promise<T> {
  return db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) as Promise<T>;
}
