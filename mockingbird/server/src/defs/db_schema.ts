import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

export const themes = sqliteTable("themes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  layoutKey: text("layout_key").notNull(),
  status: text("status").notNull().default("draft"),
  priority: integer("priority").notNull().default(0),
  abWeight: integer("ab_weight").notNull().default(100),
  paletteJson: text("palette_json").notNull(),
  fontJson: text("font_json").notNull(),
  layoutConfigJson: text("layout_config_json").notNull().default("{}"),
  copyPrompt: text("copy_prompt").notNull().default(""),
  defaultTone: text("default_tone").notNull().default("clear, warm, concise"),
  fallbackCopyJson: text("fallback_copy_json").notNull().default("{}"),
  isDefault: integer("is_default").notNull().default(0),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_themes_status_priority").on(t.status, t.deletedAt, t.priority),
  index("idx_themes_default").on(t.isDefault, t.deletedAt),
]);

export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  alt: text("alt").notNull().default(""),
  s3Uri: text("s3_uri").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  blurhash: text("blurhash"),
  tagsJson: text("tags_json").notNull().default("[]"),
  isActive: integer("is_active").notNull().default(1),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_images_kind_active").on(t.kind, t.deletedAt, t.isActive),
]);

export const matchRules = sqliteTable("match_rules", {
  id: text("id").primaryKey(),
  themeId: text("theme_id").notNull().references(() => themes.id),
  expression: text("expression").notNull(),
  compiledJson: text("compiled_json").notNull(),
  score: integer("score").notNull().default(10),
  enabled: integer("enabled").notNull().default(1),
  explanation: text("explanation"),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_match_rules_theme").on(t.themeId, t.enabled, t.deletedAt),
  index("idx_match_rules_enabled").on(t.enabled, t.deletedAt),
]);

export const bioBlurbs = sqliteTable("bio_blurbs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  source: text("source").notNull().default("owner"),
  isActive: integer("is_active").notNull().default(1),
  position: integer("position").notNull().default(0),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_bio_active_position").on(t.deletedAt, t.isActive, t.position),
]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description").notNull(),
  url: text("url"),
  imageId: text("image_id").references(() => images.id),
  tagsJson: text("tags_json").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  position: integer("position").notNull().default(0),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_projects_status_position").on(t.deletedAt, t.status, t.position),
]);

export const socials = sqliteTable("socials", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  handle: text("handle"),
  iconKey: text("icon_key"),
  isActive: integer("is_active").notNull().default(1),
  position: integer("position").notNull().default(0),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_socials_active_position").on(t.deletedAt, t.isActive, t.position),
]);

export const visitorCache = sqliteTable("visitor_cache", {
  id: text("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  themeId: text("theme_id").notNull().references(() => themes.id),
  bucketJson: text("bucket_json").notNull(),
  selectedThemeId: text("selected_theme_id").references(() => themes.id),
  rewriteJson: text("rewrite_json").notNull(),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  contentHash: text("content_hash").notNull(),
  ruleHash: text("rule_hash").notNull(),
  status: text("status").notNull().default("fresh"),
  tokenIn: integer("token_in").notNull().default(0),
  tokenOut: integer("token_out").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  lastHitAt: integer("last_hit_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_cache_key_expires").on(t.cacheKey, t.expiresAt),
  index("idx_cache_theme_expires").on(t.themeId, t.expiresAt),
]);

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  occurredAt: integer("occurred_at").notNull(),
  themeId: text("theme_id").references(() => themes.id),
  selectedThemeId: text("selected_theme_id").references(() => themes.id),
  cacheKey: text("cache_key"),
  country: text("country"),
  langRoot: text("lang_root"),
  device: text("device"),
  referrerRoot: text("referrer_root"),
  hourBand: text("hour_band"),
  isReturning: integer("is_returning").notNull().default(0),
  botScore: integer("bot_score").notNull().default(0),
  isOwner: integer("is_owner").notNull().default(0),
  userAgentHash: text("user_agent_hash"),
  visitorBucketHash: text("visitor_bucket_hash"),
  tokenIn: integer("token_in").notNull().default(0),
  tokenOut: integer("token_out").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0),
}, (t) => [
  index("idx_events_time").on(t.occurredAt),
  index("idx_events_theme_time").on(t.themeId, t.occurredAt),
  index("idx_events_type_time").on(t.eventType, t.occurredAt),
]);

export const dailyAnalyticsRollups = sqliteTable("daily_analytics_rollups", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  eventType: text("event_type").notNull(),
  themeId: text("theme_id").references(() => themes.id),
  dimension: text("dimension").notNull(),
  dimensionValue: text("dimension_value").notNull(),
  count: integer("count").notNull().default(0),
  tokenIn: integer("token_in").notNull().default(0),
  tokenOut: integer("token_out").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  unique("uq_daily_rollup").on(t.day, t.eventType, t.themeId, t.dimension, t.dimensionValue),
  index("idx_daily_rollup_day").on(t.day),
]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const previewRateLimits = sqliteTable("preview_rate_limits", {
  id: text("id").primaryKey(),
  principalKey: text("principal_key").notNull(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  unique("uq_preview_rate_limit_window").on(t.principalKey, t.windowStart),
  index("idx_preview_rate_limit_principal").on(t.principalKey, t.windowStart),
]);

export const imageUploadIntents = sqliteTable("image_upload_intents", {
  id: text("id").primaryKey(),
  imageId: text("image_id").notNull(),
  assetId: text("asset_id").notNull(),
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  contentType: text("content_type").notNull(),
  expiresAt: integer("expires_at").notNull(),
  confirmedAt: integer("confirmed_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  unique("uq_image_upload_intent_pair").on(t.imageId, t.assetId),
  index("idx_image_upload_intents_expires").on(t.expiresAt, t.confirmedAt),
]);
