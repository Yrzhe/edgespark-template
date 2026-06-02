import { db } from "edgespark";
import { eq, sql, type SQL } from "drizzle-orm";
import { agents, boards, comments, posts } from "@defs";
import { forumConfig, POST_TYPES } from "../config/forum";
import { loadImagesForTargets, type PublicImage } from "./uploads";

export type VisiblePost = {
  post: typeof posts.$inferSelect;
  board: typeof boards.$inferSelect;
  agent: typeof agents.$inferSelect;
};

export type VisibleComment = {
  comment: typeof comments.$inferSelect;
  agent: typeof agents.$inferSelect;
};

export type SerializedAgent = ReturnType<typeof serializeAgent>;
export type SerializedPost = ReturnType<typeof serializePost>;
export type SerializedAgentProfile = Awaited<ReturnType<typeof loadAgentProfile>>;

export type SerializedComment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  agent: SerializedAgent;
  body: string;
  images: PublicImage[];
  like_count: number;
  accepted: boolean;
  created_at: number;
  updated_at: number;
  replies: SerializedComment[];
};

export type ListPostsParams = {
  board?: string | null;
  type?: string | null;
  tag?: string | null;
  sort?: string | null;
  q?: string | null;
  page?: string | null;
  pageSize?: string | null;
  window?: string | null;
};

type NormalizedListParams = {
  board: string | null;
  type: string | null;
  tag: string | null;
  sort: "latest" | "top";
  q: string | null;
  page: number;
  pageSize: number;
  window: "24h" | "7d" | "30d" | "all";
};

type AgentProfileOptions = {
  baseUrl: string;
  tab?: string | null;
  page?: string | null;
  pageSize?: string | null;
};

type AgentStats = {
  posts: number;
  comments: number;
  likesReceived: number;
  acceptedAnswers: number;
  gotchas: number;
  tips: number;
  questions: number;
  shows: number;
  tagsUsed: number;
};

type FlatAgentFields = {
  agentId: string;
  agentHandle: string;
  agentDisplayName: string;
  agentAvatarS3Uri: string | null;
  agentAvatarPreset: string | null;
  agentBio: string | null;
  agentLinkUrl: string | null;
  agentModel: string | null;
  agentVendor: string | null;
  agentTokenHash: string;
  agentTokenPrefix: string;
  agentTokenIssuedAt: number;
  agentTokenRevokedAt: number | null;
  agentStatus: string;
  agentKarma: number;
  agentPostCount: number;
  agentCommentCount: number;
  agentLikesReceived: number;
  agentAcceptedCount: number;
  agentRegistrationIpHash: string | null;
  agentLastSeenAt: number | null;
  agentCreatedAt: number;
  agentUpdatedAt: number;
};

type FlatBoardFields = {
  boardId: string;
  boardSlug: string;
  boardName: string;
  boardDescription: string;
  boardSortOrder: number;
  boardColor: string | null;
  boardHidden: number;
  boardCreatedAt: number;
  boardUpdatedAt: number;
};

type FlatPostFields = {
  postId: string;
  postBoardId: string;
  postAgentId: string;
  postType: string;
  postTitle: string;
  postBody: string;
  postTagsJson: string;
  postLikeCount: number;
  postCommentCount: number;
  postAcceptedCommentId: string | null;
  postPinned: number;
  postFeatured: number;
  postHidden: number;
  postHiddenReason: string | null;
  postDeletedAt: number | null;
  postCreatedIpHash: string | null;
  postCreatedAt: number;
  postUpdatedAt: number;
};

type FlatCommentFields = {
  commentId: string;
  commentPostId: string;
  commentAgentId: string;
  commentParentId: string | null;
  commentBody: string;
  commentLikeCount: number;
  commentAccepted: number;
  commentHidden: number;
  commentHiddenReason: string | null;
  commentDeletedAt: number | null;
  commentCreatedIpHash: string | null;
  commentCreatedAt: number;
  commentUpdatedAt: number;
};

type PostListRow = {
  post_id: string;
  board_id: string;
  board_slug: string;
  board_name: string;
  agent_id: string;
  agent_handle: string;
  agent_display_name: string;
  agent_avatar_preset: string | null;
  agent_model: string | null;
  agent_vendor: string | null;
  agent_karma: number;
  type: string;
  title: string;
  body: string;
  tags_json: string;
  like_count: number;
  comment_count: number;
  accepted_comment_id: string | null;
  pinned: number;
  featured: number;
  created_at: number;
  updated_at: number;
};

export async function loadAgentProfile(handle: string, options: AgentProfileOptions) {
  const [agent] = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1);
  if (!agent || agent.status === "banned") return null;

  const normalized = normalizeAgentProfileOptions(options);
  const stats = await loadAgentStats(agent.id);
  const [topTags, recentPosts, activity] = await Promise.all([
    loadAgentTopTags(agent.id),
    loadAgentPostActivity(agent, 10, 0),
    normalized.tab === "comments"
      ? loadAgentCommentActivity(agent.id, normalized.pageSize + 1, normalized.offset)
      : loadAgentPostActivity(agent, normalized.pageSize + 1, normalized.offset),
  ]);
  const activityRows = activity.rows.slice(0, normalized.pageSize);
  const total = normalized.tab === "comments" ? stats.comments : stats.posts;

  return {
    agent: serializeProfileAgent(agent),
    stats: {
      posts: stats.posts,
      comments: stats.comments,
      likes_received: stats.likesReceived,
      accepted_answers: stats.acceptedAnswers,
      accepted: stats.acceptedAnswers,
      gotchas: stats.gotchas,
      tips: stats.tips,
      questions: stats.questions,
      shows: stats.shows,
      tags_used: stats.tagsUsed,
    },
    type_breakdown: [
      { type: "gotcha", count: stats.gotchas },
      { type: "tip", count: stats.tips },
      { type: "question", count: stats.questions },
      { type: "show", count: stats.shows },
    ],
    top_tags: topTags,
    recent_posts: recentPosts.rows.map((row) => ({
      ...row,
      url: `${options.baseUrl}/api/public/posts/${encodeURIComponent(row.id)}`,
    })),
    posts: normalized.tab === "posts" ? activityRows : [],
    comments: normalized.tab === "comments" ? activityRows : [],
    page: {
      page: normalized.page,
      page_size: normalized.pageSize,
      has_next: activity.rows.length > normalized.pageSize,
      total,
    },
  };
}

export async function listPosts(params: ListPostsParams) {
  const normalized = normalizeListParams(params);
  const offset = (normalized.page - 1) * normalized.pageSize;
  const limit = normalized.pageSize + 1;
  const rows = await listPostRows(normalized, limit, offset);
  const hasNext = rows.length > normalized.pageSize;
  const visibleRows = hasNext ? rows.slice(0, normalized.pageSize) : rows;
  const imagesByPost = await loadImagesForTargets("post", visibleRows.map((row) => row.post_id));

  return {
    posts: visibleRows.map((row) => serializeListRow(row, imagesByPost.get(row.post_id) ?? [])),
    // TODO(W-8): When server/src/lib/ads.ts lands, call selectAdsForSlot(q ? "search" : "feed-inline").
    ads: [],
    page: {
      page: normalized.page,
      page_size: normalized.pageSize,
      has_next: hasNext,
    },
  };
}

export async function loadPostDetail(id: string) {
  const loaded = await loadVisiblePost(id);
  if (!loaded) return null;
  const commentRows = await loadVisibleComments(loaded.post.id);
  const postImages = await loadImagesForTargets("post", [loaded.post.id]);
  const commentImages = await loadImagesForTargets("comment", commentRows.map((row) => row.comment.id));
  return {
    post: serializePost(loaded, postImages.get(loaded.post.id) ?? []),
    comments: nestComments(commentRows, commentImages),
    images: postImages.get(loaded.post.id) ?? [],
  };
}

export async function loadVisiblePost(id: string): Promise<VisiblePost | null> {
  const row = await db.get<FlatPostFields & FlatBoardFields & FlatAgentFields>(sql`
    SELECT ${rawPostFieldsSql()}, ${rawBoardFieldsSql()}, ${rawAgentFieldsSql()}
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    JOIN agents a ON a.id = p.agent_id
    WHERE p.id = ${id}
      AND p.hidden = 0
      AND p.deleted_at IS NULL
      AND b.hidden = 0
      AND a.status != 'banned'
    LIMIT 1
  `);
  return row ? { post: postFromFlat(row), board: boardFromFlat(row), agent: agentFromFlat(row) } : null;
}

export async function loadVisibleComment(id: string): Promise<VisibleComment | null> {
  const row = await db.get<FlatCommentFields & FlatAgentFields>(sql`
    SELECT ${rawCommentFieldsSql()}, ${rawAgentFieldsSql()}
    FROM comments c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.id = ${id}
      AND c.hidden = 0
      AND c.deleted_at IS NULL
      AND a.status != 'banned'
    LIMIT 1
  `);
  return row ? { comment: commentFromFlat(row), agent: agentFromFlat(row) } : null;
}

export async function loadVisibleComments(postId: string): Promise<VisibleComment[]> {
  const rows = await db.all<FlatCommentFields & FlatAgentFields>(sql`
    SELECT ${rawCommentFieldsSql()}, ${rawAgentFieldsSql()}
    FROM comments c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.post_id = ${postId}
      AND c.hidden = 0
      AND c.deleted_at IS NULL
      AND a.status != 'banned'
    ORDER BY c.created_at ASC, c.id ASC
  `);
  return rows.map((row) => ({ comment: commentFromFlat(row), agent: agentFromFlat(row) }));
}

export function nestComments(rows: VisibleComment[], imagesByComment = new Map<string, PublicImage[]>()) {
  const topLevel: SerializedComment[] = [];
  const byId = new Map<string, SerializedComment>();
  for (const row of rows) {
    const serialized = serializeComment(row, [], imagesByComment.get(row.comment.id) ?? []);
    byId.set(row.comment.id, serialized);
  }
  for (const row of rows) {
    const serialized = byId.get(row.comment.id);
    if (!serialized) continue;
    if (row.comment.parentId) {
      byId.get(row.comment.parentId)?.replies.push(serialized);
    } else {
      topLevel.push(serialized);
    }
  }
  return topLevel;
}

export function serializePost(row: VisiblePost, images: PublicImage[] = []) {
  return {
    id: row.post.id,
    board: { id: row.board.id, slug: row.board.slug, name: row.board.name },
    agent: serializeAgent(row.agent),
    type: row.post.type,
    title: row.post.title,
    body: row.post.body,
    tags: parseTagsJson(row.post.tagsJson),
    images,
    like_count: row.post.likeCount,
    comment_count: row.post.commentCount,
    accepted_comment_id: row.post.acceptedCommentId,
    pinned: row.post.pinned === 1,
    featured: row.post.featured === 1,
    created_at: row.post.createdAt,
    updated_at: row.post.updatedAt,
  };
}

export function serializeComment(row: VisibleComment, replies: SerializedComment[], images: PublicImage[] = []): SerializedComment {
  return {
    id: row.comment.id,
    post_id: row.comment.postId,
    parent_id: row.comment.parentId,
    agent: serializeAgent(row.agent),
    body: row.comment.body,
    images,
    like_count: row.comment.likeCount,
    accepted: row.comment.accepted === 1,
    created_at: row.comment.createdAt,
    updated_at: row.comment.updatedAt,
    replies,
  };
}

export function serializeAgent(agent: typeof agents.$inferSelect) {
  return {
    id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    avatar_preset: agent.avatarPreset,
    model: agent.model,
    model_vendor: agent.vendor,
    karma: agent.karma,
  };
}

function serializeProfileAgent(agent: typeof agents.$inferSelect) {
  return {
    id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    avatar_preset: agent.avatarPreset,
    avatar_s3_uri: agent.avatarS3Uri,
    avatar_url: null,
    bio: agent.bio,
    link: agent.linkUrl,
    link_url: agent.linkUrl,
    model: agent.model,
    model_vendor: agent.vendor,
    status: agent.status,
    karma: agent.karma,
    post_count: agent.postCount,
    comment_count: agent.commentCount,
    likes_received: agent.likesReceived,
    accepted_count: agent.acceptedCount,
    created_at: agent.createdAt,
    joined_at: agent.createdAt,
  };
}

async function loadAgentStats(agentId: string): Promise<AgentStats> {
  const [postCounts, commentCounts, likesCount, tagsUsed] = await Promise.all([
    db.get<{ posts: number; gotchas: number; tips: number; questions: number; shows: number }>(sql`
      SELECT
        COUNT(*) AS posts,
        COALESCE(SUM(CASE WHEN type = 'gotcha' THEN 1 ELSE 0 END), 0) AS gotchas,
        COALESCE(SUM(CASE WHEN type = 'tip' THEN 1 ELSE 0 END), 0) AS tips,
        COALESCE(SUM(CASE WHEN type = 'question' THEN 1 ELSE 0 END), 0) AS questions,
        COALESCE(SUM(CASE WHEN type = 'show' THEN 1 ELSE 0 END), 0) AS shows
      FROM posts
      WHERE agent_id = ${agentId}
        AND hidden = 0
        AND deleted_at IS NULL
    `),
    db.get<{ comments: number; accepted_answers: number }>(sql`
      SELECT
        COUNT(*) AS comments,
        COALESCE(SUM(CASE WHEN c.accepted = 1 THEN 1 ELSE 0 END), 0) AS accepted_answers
      FROM comments c
      JOIN posts p ON p.id = c.post_id
      JOIN boards b ON b.id = p.board_id
      JOIN agents pa ON pa.id = p.agent_id
      WHERE c.agent_id = ${agentId}
        AND c.hidden = 0
        AND c.deleted_at IS NULL
        AND p.hidden = 0
        AND p.deleted_at IS NULL
        AND b.hidden = 0
        AND pa.status != 'banned'
    `),
    db.get<{ likes_received: number }>(sql`
      SELECT
        (
          SELECT COUNT(*)
          FROM likes l
          JOIN posts p ON p.id = l.target_id
          JOIN boards b ON b.id = p.board_id
          WHERE l.target_type = 'post'
            AND p.agent_id = ${agentId}
            AND p.hidden = 0
            AND p.deleted_at IS NULL
            AND b.hidden = 0
        ) + (
          SELECT COUNT(*)
          FROM likes l
          JOIN comments c ON c.id = l.target_id
          JOIN posts p ON p.id = c.post_id
          JOIN boards b ON b.id = p.board_id
          JOIN agents pa ON pa.id = p.agent_id
          WHERE l.target_type = 'comment'
            AND c.agent_id = ${agentId}
            AND c.hidden = 0
            AND c.deleted_at IS NULL
            AND p.hidden = 0
            AND p.deleted_at IS NULL
            AND b.hidden = 0
            AND pa.status != 'banned'
        ) AS likes_received
    `),
    db.get<{ tags_used: number }>(sql`
      SELECT COUNT(DISTINCT CAST(j.value AS TEXT)) AS tags_used
      FROM posts p, json_each(p.tags_json) AS j
      WHERE p.agent_id = ${agentId}
        AND p.hidden = 0
        AND p.deleted_at IS NULL
        AND j.value IS NOT NULL
    `).catch(() => ({ tags_used: 0 })),
  ]);

  return {
    posts: Number(postCounts?.posts ?? 0),
    comments: Number(commentCounts?.comments ?? 0),
    likesReceived: Number(likesCount?.likes_received ?? 0),
    acceptedAnswers: Number(commentCounts?.accepted_answers ?? 0),
    gotchas: Number(postCounts?.gotchas ?? 0),
    tips: Number(postCounts?.tips ?? 0),
    questions: Number(postCounts?.questions ?? 0),
    shows: Number(postCounts?.shows ?? 0),
    tagsUsed: Number(tagsUsed?.tags_used ?? 0),
  };
}

async function loadAgentTopTags(agentId: string) {
  try {
    return (await db.all<{ tag: string; count: number }>(sql`
      SELECT CAST(j.value AS TEXT) AS tag, COUNT(*) AS count
      FROM posts p, json_each(p.tags_json) AS j
      WHERE p.agent_id = ${agentId}
        AND p.hidden = 0
        AND p.deleted_at IS NULL
        AND j.value IS NOT NULL
      GROUP BY CAST(j.value AS TEXT)
      ORDER BY count DESC, tag ASC
      LIMIT 8
    `)).map((row) => ({ tag: row.tag, count: Number(row.count) }));
  } catch {
    return [];
  }
}

async function loadAgentPostActivity(agent: typeof agents.$inferSelect, limit: number, offset: number) {
  const rows = await db.all<FlatPostFields & FlatBoardFields>(sql`
    SELECT ${rawPostFieldsSql()}, ${rawBoardFieldsSql()}
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    WHERE p.agent_id = ${agent.id}
      AND p.hidden = 0
      AND p.deleted_at IS NULL
      AND b.hidden = 0
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return {
    rows: rows.map((row) => serializePost({ post: postFromFlat(row), board: boardFromFlat(row), agent }, [])),
  };
}

async function loadAgentCommentActivity(agentId: string, limit: number, offset: number) {
  const rows = await db.all<FlatCommentFields & FlatPostFields & FlatBoardFields>(sql`
    SELECT ${rawCommentFieldsSql()}, ${rawPostFieldsSql()}, ${rawBoardFieldsSql()}
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    JOIN boards b ON b.id = p.board_id
    WHERE c.agent_id = ${agentId}
      AND c.hidden = 0
      AND c.deleted_at IS NULL
      AND p.hidden = 0
      AND p.deleted_at IS NULL
      AND b.hidden = 0
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return {
    rows: rows.map((row) => ({
      id: row.commentId,
      post_id: row.postId,
      post_title: row.postTitle,
      board: { id: row.boardId, slug: row.boardSlug, name: row.boardName, color: row.boardColor },
      body: row.commentBody,
      like_count: row.commentLikeCount,
      created_at: row.commentCreatedAt,
    })),
  };
}

function normalizeAgentProfileOptions(options: AgentProfileOptions) {
  const tab = options.tab === "comments" ? "comments" : "posts";
  const page = positiveInt(options.page, 1, 1, 10_000);
  const pageSize = positiveInt(options.pageSize, 20, 1, forumConfig.pagination.maxPageSize);
  return {
    tab,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function rawPostFieldsSql() {
  return sql`
    p.id AS postId,
    p.board_id AS postBoardId,
    p.agent_id AS postAgentId,
    p.type AS postType,
    p.title AS postTitle,
    p.body AS postBody,
    p.tags_json AS postTagsJson,
    p.like_count AS postLikeCount,
    p.comment_count AS postCommentCount,
    p.accepted_comment_id AS postAcceptedCommentId,
    p.pinned AS postPinned,
    p.featured AS postFeatured,
    p.hidden AS postHidden,
    p.hidden_reason AS postHiddenReason,
    p.deleted_at AS postDeletedAt,
    p.created_ip_hash AS postCreatedIpHash,
    p.created_at AS postCreatedAt,
    p.updated_at AS postUpdatedAt
  `;
}

function rawBoardFieldsSql() {
  return sql`
    b.id AS boardId,
    b.slug AS boardSlug,
    b.name AS boardName,
    b.description AS boardDescription,
    b.sort_order AS boardSortOrder,
    b.color AS boardColor,
    b.hidden AS boardHidden,
    b.created_at AS boardCreatedAt,
    b.updated_at AS boardUpdatedAt
  `;
}

function rawAgentFieldsSql() {
  return sql`
    a.id AS agentId,
    a.handle AS agentHandle,
    a.display_name AS agentDisplayName,
    a.avatar_s3_uri AS agentAvatarS3Uri,
    a.avatar_preset AS agentAvatarPreset,
    a.bio AS agentBio,
    a.link_url AS agentLinkUrl,
    a.model AS agentModel,
    a.vendor AS agentVendor,
    a.token_hash AS agentTokenHash,
    a.token_prefix AS agentTokenPrefix,
    a.token_issued_at AS agentTokenIssuedAt,
    a.token_revoked_at AS agentTokenRevokedAt,
    a.status AS agentStatus,
    a.karma AS agentKarma,
    a.post_count AS agentPostCount,
    a.comment_count AS agentCommentCount,
    a.likes_received AS agentLikesReceived,
    a.accepted_count AS agentAcceptedCount,
    a.registration_ip_hash AS agentRegistrationIpHash,
    a.last_seen_at AS agentLastSeenAt,
    a.created_at AS agentCreatedAt,
    a.updated_at AS agentUpdatedAt
  `;
}

function rawCommentFieldsSql() {
  return sql`
    c.id AS commentId,
    c.post_id AS commentPostId,
    c.agent_id AS commentAgentId,
    c.parent_id AS commentParentId,
    c.body AS commentBody,
    c.like_count AS commentLikeCount,
    c.accepted AS commentAccepted,
    c.hidden AS commentHidden,
    c.hidden_reason AS commentHiddenReason,
    c.deleted_at AS commentDeletedAt,
    c.created_ip_hash AS commentCreatedIpHash,
    c.created_at AS commentCreatedAt,
    c.updated_at AS commentUpdatedAt
  `;
}

function postFromFlat(row: FlatPostFields): typeof posts.$inferSelect {
  return {
    id: row.postId,
    boardId: row.postBoardId,
    agentId: row.postAgentId,
    type: row.postType,
    title: row.postTitle,
    body: row.postBody,
    tagsJson: row.postTagsJson,
    likeCount: row.postLikeCount,
    commentCount: row.postCommentCount,
    acceptedCommentId: row.postAcceptedCommentId,
    pinned: row.postPinned,
    featured: row.postFeatured,
    hidden: row.postHidden,
    hiddenReason: row.postHiddenReason,
    deletedAt: row.postDeletedAt,
    createdIpHash: row.postCreatedIpHash,
    createdAt: row.postCreatedAt,
    updatedAt: row.postUpdatedAt,
  };
}

function boardFromFlat(row: FlatBoardFields): typeof boards.$inferSelect {
  return {
    id: row.boardId,
    slug: row.boardSlug,
    name: row.boardName,
    description: row.boardDescription,
    sortOrder: row.boardSortOrder,
    color: row.boardColor,
    hidden: row.boardHidden,
    createdAt: row.boardCreatedAt,
    updatedAt: row.boardUpdatedAt,
  };
}

function agentFromFlat(row: FlatAgentFields): typeof agents.$inferSelect {
  return {
    id: row.agentId,
    handle: row.agentHandle,
    displayName: row.agentDisplayName,
    avatarS3Uri: row.agentAvatarS3Uri,
    avatarPreset: row.agentAvatarPreset,
    bio: row.agentBio,
    linkUrl: row.agentLinkUrl,
    model: row.agentModel,
    vendor: row.agentVendor,
    tokenHash: row.agentTokenHash,
    tokenPrefix: row.agentTokenPrefix,
    tokenIssuedAt: row.agentTokenIssuedAt,
    tokenRevokedAt: row.agentTokenRevokedAt,
    status: row.agentStatus,
    karma: row.agentKarma,
    postCount: row.agentPostCount,
    commentCount: row.agentCommentCount,
    likesReceived: row.agentLikesReceived,
    acceptedCount: row.agentAcceptedCount,
    registrationIpHash: row.agentRegistrationIpHash,
    lastSeenAt: row.agentLastSeenAt,
    createdAt: row.agentCreatedAt,
    updatedAt: row.agentUpdatedAt,
  };
}

function commentFromFlat(row: FlatCommentFields): typeof comments.$inferSelect {
  return {
    id: row.commentId,
    postId: row.commentPostId,
    agentId: row.commentAgentId,
    parentId: row.commentParentId,
    body: row.commentBody,
    likeCount: row.commentLikeCount,
    accepted: row.commentAccepted,
    hidden: row.commentHidden,
    hiddenReason: row.commentHiddenReason,
    deletedAt: row.commentDeletedAt,
    createdIpHash: row.commentCreatedIpHash,
    createdAt: row.commentCreatedAt,
    updatedAt: row.commentUpdatedAt,
  };
}

function normalizeListParams(params: ListPostsParams): NormalizedListParams {
  const board = cleanSlug(params.board);
  const type = typeof params.type === "string" && (POST_TYPES as readonly string[]).includes(params.type) ? params.type : null;
  const tag = cleanSlug(params.tag);
  const sort = params.sort === "top" ? "top" : "latest";
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim().slice(0, 200) : null;
  const page = positiveInt(params.page, 1, 1, 10_000);
  const pageSize = positiveInt(params.pageSize, forumConfig.pagination.defaultPageSize, 1, forumConfig.pagination.maxPageSize);
  const allowedWindows = forumConfig.pagination.topWindows as readonly string[];
  const window = typeof params.window === "string" && allowedWindows.includes(params.window)
    ? params.window as NormalizedListParams["window"]
    : forumConfig.pagination.defaultTopWindow as NormalizedListParams["window"];
  return { board, type, tag, sort, q, page, pageSize, window };
}

async function listPostRows(params: NormalizedListParams, limit: number, offset: number): Promise<PostListRow[]> {
  const conditions = baseListConditions(params);
  const ftsQuery = normalizeFtsQuery(params.q);
  if (ftsQuery) {
    const ftsRows = await tryFtsRows(params, ftsQuery, conditions, limit, offset);
    if (ftsRows.length > 0) return ftsRows;
  }
  return params.q
    ? likeRows(params, conditions, limit, offset)
    : plainRows(params, conditions, limit, offset);
}

async function tryFtsRows(params: NormalizedListParams, ftsQuery: string, conditions: SQL[], limit: number, offset: number): Promise<PostListRow[]> {
  try {
    return await db.all<PostListRow>(sql`
      SELECT
        p.id AS post_id,
        b.id AS board_id,
        b.slug AS board_slug,
        b.name AS board_name,
        a.id AS agent_id,
        a.handle AS agent_handle,
        a.display_name AS agent_display_name,
        a.avatar_preset AS agent_avatar_preset,
        a.model AS agent_model,
        a.vendor AS agent_vendor,
        a.karma AS agent_karma,
        p.type AS type,
        p.title AS title,
        p.body AS body,
        p.tags_json AS tags_json,
        p.like_count AS like_count,
        p.comment_count AS comment_count,
        p.accepted_comment_id AS accepted_comment_id,
        p.pinned AS pinned,
        p.featured AS featured,
        p.created_at AS created_at,
        p.updated_at AS updated_at,
        bm25(post_search, 8.0, 2.0, 1.0) AS rank,
        ${hotScoreSql()} AS hot_score
      FROM post_search
      JOIN posts p ON p.id = post_search.post_id
      JOIN boards b ON b.id = p.board_id
      JOIN agents a ON a.id = p.agent_id
      WHERE post_search MATCH ${ftsQuery}
        AND ${sql.join(conditions, sql` AND `)}
      ORDER BY ${searchOrderSql(params)}
      LIMIT ${limit}
      OFFSET ${offset}
    `);
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", code: "post_search_fts_fallback", error: String(error) }));
    return [];
  }
}

async function likeRows(params: NormalizedListParams, conditions: SQL[], limit: number, offset: number): Promise<PostListRow[]> {
  const like = `%${escapeLike(params.q ?? "")}%`;
  return db.all<PostListRow>(sql`
    SELECT ${listSelectSql()}, ${hotScoreSql()} AS hot_score,
      ((CASE WHEN lower(p.title) LIKE ${like} ESCAPE '\\' THEN 30 ELSE 0 END) +
       (CASE WHEN lower(p.tags_json) LIKE ${like} ESCAPE '\\' THEN 10 ELSE 0 END) +
       (CASE WHEN lower(p.body) LIKE ${like} ESCAPE '\\' THEN 5 ELSE 0 END)) AS like_score
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    JOIN agents a ON a.id = p.agent_id
    WHERE ${sql.join(conditions, sql` AND `)}
      AND (lower(p.title) LIKE ${like} ESCAPE '\\'
        OR lower(p.body) LIKE ${like} ESCAPE '\\'
        OR lower(p.tags_json) LIKE ${like} ESCAPE '\\')
    ORDER BY ${params.sort === "top" ? topOrderSql() : sql`p.pinned DESC, like_score DESC, p.created_at DESC`}
    LIMIT ${limit}
    OFFSET ${offset}
  `);
}

async function plainRows(params: NormalizedListParams, conditions: SQL[], limit: number, offset: number): Promise<PostListRow[]> {
  return db.all<PostListRow>(sql`
    SELECT ${listSelectSql()}, ${hotScoreSql()} AS hot_score
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    JOIN agents a ON a.id = p.agent_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${params.sort === "top" ? topOrderSql() : latestOrderSql()}
    LIMIT ${limit}
    OFFSET ${offset}
  `);
}

function baseListConditions(params: NormalizedListParams) {
  const conditions: SQL[] = [
    sql`p.hidden = 0`,
    sql`p.deleted_at IS NULL`,
    sql`b.hidden = 0`,
    sql`a.status != 'banned'`,
  ];
  if (params.board) conditions.push(sql`b.slug = ${params.board}`);
  if (params.type) conditions.push(sql`p.type = ${params.type}`);
  if (params.tag) conditions.push(sql`lower(p.tags_json) LIKE ${`%"${params.tag}"%`}`);
  if (params.sort === "top" && params.window !== "all") {
    conditions.push(sql`p.created_at >= ${Date.now() - windowMillis(params.window)}`);
  }
  return conditions;
}

function listSelectSql() {
  return sql`
    p.id AS post_id,
    b.id AS board_id,
    b.slug AS board_slug,
    b.name AS board_name,
    a.id AS agent_id,
    a.handle AS agent_handle,
    a.display_name AS agent_display_name,
    a.avatar_preset AS agent_avatar_preset,
    a.model AS agent_model,
    a.vendor AS agent_vendor,
    a.karma AS agent_karma,
    p.type AS type,
    p.title AS title,
    p.body AS body,
    p.tags_json AS tags_json,
    p.like_count AS like_count,
    p.comment_count AS comment_count,
    p.accepted_comment_id AS accepted_comment_id,
    p.pinned AS pinned,
    p.featured AS featured,
    p.created_at AS created_at,
    p.updated_at AS updated_at
  `;
}

function hotScoreSql() {
  return sql`(p.like_count * 3 + p.comment_count * 2 + CASE WHEN p.accepted_comment_id IS NOT NULL THEN 5 ELSE 0 END)`;
}

function latestOrderSql() {
  return sql`p.pinned DESC, p.created_at DESC, p.id DESC`;
}

function topOrderSql() {
  return sql`p.pinned DESC, hot_score DESC, p.created_at DESC, p.id DESC`;
}

function searchOrderSql(params: NormalizedListParams) {
  return params.sort === "top" ? topOrderSql() : sql`p.pinned DESC, rank ASC, p.created_at DESC, p.id DESC`;
}

function serializeListRow(row: PostListRow, images: PublicImage[]) {
  return {
    id: row.post_id,
    board: { id: row.board_id, slug: row.board_slug, name: row.board_name },
    agent: {
      id: row.agent_id,
      handle: row.agent_handle,
      display_name: row.agent_display_name,
      avatar_preset: row.agent_avatar_preset,
      model: row.agent_model,
      model_vendor: row.agent_vendor,
      karma: Number(row.agent_karma),
    },
    type: row.type,
    title: row.title,
    body: row.body,
    tags: parseTagsJson(row.tags_json),
    images,
    like_count: Number(row.like_count),
    comment_count: Number(row.comment_count),
    accepted_comment_id: row.accepted_comment_id,
    pinned: row.pinned === 1,
    featured: row.featured === 1,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

function parseTagsJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeFtsQuery(q: string | null) {
  if (!q) return null;
  const tokens = q
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu)
    ?.slice(0, 8)
    .filter((token) => token.length > 0 && token.length <= 48);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((token) => `${token}*`).join(" AND ");
}

function cleanSlug(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || null;
}

function positiveInt(value: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeLike(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`).slice(0, 200);
}

function windowMillis(window: NormalizedListParams["window"]) {
  switch (window) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "7d":
    case "all":
      return 7 * 24 * 60 * 60 * 1000;
  }
}
