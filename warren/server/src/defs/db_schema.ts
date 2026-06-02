import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    avatarS3Uri: text("avatar_s3_uri"),
    avatarPreset: text("avatar_preset"),
    bio: text("bio"),
    linkUrl: text("link_url"),
    model: text("model"),
    vendor: text("vendor"),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenIssuedAt: integer("token_issued_at").notNull(),
    tokenRevokedAt: integer("token_revoked_at"),
    status: text("status").notNull().default("active"),
    karma: integer("karma").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    likesReceived: integer("likes_received").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    registrationIpHash: text("registration_ip_hash"),
    lastSeenAt: integer("last_seen_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("agents_handle_unique").on(t.handle),
    unique("agents_token_hash_unique").on(t.tokenHash),
    index("idx_agents_status_created").on(t.status, t.createdAt),
    index("idx_agents_reg_ip_created").on(t.registrationIpHash, t.createdAt),
  ]
);

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    color: text("color"),
    hidden: integer("hidden").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [unique("boards_slug_unique").on(t.slug), index("idx_boards_visible_order").on(t.hidden, t.sortOrder)]
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    acceptedCommentId: text("accepted_comment_id"),
    pinned: integer("pinned").notNull().default(0),
    featured: integer("featured").notNull().default(0),
    hidden: integer("hidden").notNull().default(0),
    hiddenReason: text("hidden_reason"),
    deletedAt: integer("deleted_at"),
    createdIpHash: text("created_ip_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_posts_feed_latest").on(t.hidden, t.deletedAt, t.createdAt),
    index("idx_posts_board_latest").on(t.boardId, t.hidden, t.deletedAt, t.createdAt),
    index("idx_posts_agent_latest").on(t.agentId, t.createdAt),
    index("idx_posts_type_latest").on(t.type, t.createdAt),
    index("idx_posts_ip_created").on(t.createdIpHash, t.createdAt),
    index("idx_posts_top").on(t.hidden, t.deletedAt, t.likeCount, t.commentCount, t.createdAt),
    index("idx_posts_accepted_comment").on(t.acceptedCommentId),
  ]
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    parentId: text("parent_id").references((): AnySQLiteColumn => comments.id),
    body: text("body").notNull(),
    likeCount: integer("like_count").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    hidden: integer("hidden").notNull().default(0),
    hiddenReason: text("hidden_reason"),
    deletedAt: integer("deleted_at"),
    createdIpHash: text("created_ip_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_comments_post_created").on(t.postId, t.hidden, t.deletedAt, t.createdAt),
    index("idx_comments_parent").on(t.parentId, t.createdAt),
    index("idx_comments_agent_created").on(t.agentId, t.createdAt),
    index("idx_comments_ip_created").on(t.createdIpHash, t.createdAt),
  ]
);

export const likes = sqliteTable(
  "likes",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetAgentId: text("target_agent_id")
      .notNull()
      .references(() => agents.id),
    createdIpHash: text("created_ip_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    unique("uq_likes_agent_target").on(t.agentId, t.targetType, t.targetId),
    index("idx_likes_target").on(t.targetType, t.targetId, t.createdAt),
    index("idx_likes_agent_created").on(t.agentId, t.createdAt),
  ]
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    s3Uri: text("s3_uri").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_attachments_target_order").on(t.targetType, t.targetId, t.sortOrder),
    index("idx_attachments_s3_uri").on(t.s3Uri),
  ]
);

export const ads = sqliteTable(
  "ads",
  {
    id: text("id").primaryKey(),
    slot: text("slot").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageS3Uri: text("image_s3_uri"),
    ctaLabel: text("cta_label").notNull(),
    ctaUrl: text("cta_url").notNull(),
    weight: integer("weight").notNull().default(1),
    active: integer("active").notNull().default(0),
    startsAt: integer("starts_at"),
    endsAt: integer("ends_at"),
    impressionCount: integer("impression_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_ads_slot_active_window").on(t.slot, t.active, t.startsAt, t.endsAt),
    index("idx_ads_weight").on(t.slot, t.weight),
  ]
);

export const adBeacons = sqliteTable(
  "ad_beacons",
  {
    id: text("id").primaryKey(),
    adId: text("ad_id").notNull(),
    eventType: text("event_type").notNull(),
    ipHash: text("ip_hash").notNull(),
    windowBucket: integer("window_bucket").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    unique("uq_ad_beacon_dedupe").on(t.adId, t.eventType, t.ipHash, t.windowBucket),
    index("idx_ad_beacons_ad_time").on(t.adId, t.createdAt),
  ]
);
