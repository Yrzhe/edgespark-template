/**
 * Database Schema - Arena spectator + voting template.
 *
 * IDs and timestamps follow the frozen contract in sources/arena/CONTRACTS.md.
 * Table names intentionally keep the contract's camelCase names.
 */

import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const competition = sqliteTable("competition", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(), // draft | live | ended
  startsAt: integer("starts_at"),
  endsAt: integer("ends_at"),
  upstreamBaseUrl: text("upstream_base_url").notNull(),
  votingEnabled: integer("voting_enabled").notNull().default(1),
  commentsEnabled: integer("comments_enabled").notNull().default(1),
  activeSeasonId: text("active_season_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const contestants = sqliteTable("contestants", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline").notNull().default(""),
  avatarS3Uri: text("avatar_s3_uri"),
  accentColor: text("accent_color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  hidden: integer("hidden").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const voteBuckets = sqliteTable(
  "voteBuckets",
  {
    seasonId: text("season_id").notNull(),
    contestantId: text("contestant_id").notNull(),
    bucketStart: integer("bucket_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.contestantId, t.bucketStart] })]
);

export const contestantTotals = sqliteTable(
  "contestantTotals",
  {
    seasonId: text("season_id").notNull(),
    contestantId: text("contestant_id").notNull(),
    total: integer("total").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.contestantId] })]
);

export const draftVoters = sqliteTable(
  "draftVoters",
  {
    seasonId: text("season_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.userId] })]
);

export const dailyRollups = sqliteTable(
  "dailyRollups",
  {
    seasonId: text("season_id").notNull(),
    contestantId: text("contestant_id").notNull(),
    day: text("day").notNull(),
    votes: integer("votes").notNull().default(0),
    equityOpen: real("equity_open"),
    equityClose: real("equity_close"),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.contestantId, t.day] }), index("idx_daily_rollups_day").on(t.day)]
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonId: text("season_id").notNull(),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    text: text("text").notNull(),
    mentions: text("mentions").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    hidden: integer("hidden").notNull().default(0),
  },
  (t) => [index("idx_comments_created_at").on(t.createdAt), index("idx_comments_season").on(t.seasonId)]
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: integer("id").primaryKey(),
    contestantId: text("contestant_id").notNull(),
    symbol: text("symbol").notNull(),
    action: text("action").notNull(),
    qty: real("qty"),
    price: real("price"),
    stopLoss: real("stop_loss"),
    profitTarget: real("profit_target"),
    riskUsd: real("risk_usd"),
    confidence: real("confidence"),
    confidenceNum: integer("confidence_num"),
    reasoning: text("reasoning").notNull().default(""),
    justification: text("justification").notNull().default(""),
    chainOfThought: text("chain_of_thought").notNull().default(""),
    timestamp: integer("timestamp").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_decisions_contestant_created").on(t.contestantId, t.createdAt), index("idx_decisions_created_at").on(t.createdAt)]
);

export const upstreamCache = sqliteTable("upstreamCache", {
  resource: text("resource").primaryKey(),
  payload: text("payload").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const ownerSettings = sqliteTable("owner_settings", {
  id: text("id").primaryKey(),
  avatarS3Uri: text("avatar_s3_uri"),
  updatedAt: integer("updated_at").notNull(),
});
