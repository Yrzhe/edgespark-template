/**
 * Database Schema — Perch link-in-bio + analytics.
 *
 * Opaque UUID text IDs, epoch-ms timestamps, soft delete via deletedAt,
 * and optimistic edits via lockVersion follow Hatch's server conventions.
 *
 * TODO(scaffold): after `edgespark init`, copy this into
 * `edgespark-template/perch/server/src/defs/db_schema.ts`, then generate migrations.
 */

import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarS3Uri: text("avatar_s3_uri"),
    coverS3Uri: text("cover_s3_uri"),
    socialLinksJson: text("social_links_json").notNull().default("[]"),
    themeJson: text("theme_json").notNull(),
    isDefault: integer("is_default").notNull().default(0),
    publishedAt: integer("published_at"),
    lockVersion: integer("lock_version").notNull().default(0),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_pages_deleted_updated").on(t.deletedAt, t.updatedAt),
    index("idx_pages_default").on(t.isDefault),
  ]
);

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    thumbnailS3Uri: text("thumbnail_s3_uri"),
    position: integer("position").notNull(),
    isActive: integer("is_active").notNull().default(1),
    isFeatured: integer("is_featured").notNull().default(0),
    linkKind: text("link_kind").notNull().default("link"), // 'link' | 'section'
    deletedAt: integer("deleted_at"),
    lockVersion: integer("lock_version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("uq_links_page_position").on(t.pageId, t.position),
    index("idx_links_page_active_position").on(t.pageId, t.deletedAt, t.isActive, t.position),
  ]
);

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    linkId: text("link_id").references(() => links.id),
    eventType: text("event_type").notNull(), // 'view' | 'click'
    occurredAt: integer("occurred_at").notNull(),
    referrerHost: text("referrer_host"),
    deviceType: text("device_type"), // 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'
    country: text("country"),
    userAgentHash: text("user_agent_hash"),
    ipHash: text("ip_hash"),
    botScore: integer("bot_score").notNull().default(0),
  },
  (t) => [
    index("idx_events_page_time").on(t.pageId, t.occurredAt),
    index("idx_events_page_type_time").on(t.pageId, t.eventType, t.occurredAt),
    index("idx_events_link_time").on(t.linkId, t.occurredAt),
  ]
);

export const dailyAnalyticsRollups = sqliteTable(
  "daily_analytics_rollups",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    linkId: text("link_id").references(() => links.id),
    eventType: text("event_type").notNull(),
    dimension: text("dimension").notNull(), // 'total' | 'referrer' | 'device' | 'country'
    dimensionValue: text("dimension_value").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("uq_daily_rollup").on(t.day, t.pageId, t.linkId, t.eventType, t.dimension, t.dimensionValue),
    index("idx_daily_rollup_page_day").on(t.pageId, t.day),
  ]
);

// Exact Hatch shape; keep compatible with managementAuth and the API Keys screen.
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});
