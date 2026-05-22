/**
 * Database Schema — EdgeSpark Site Host + BaaS
 *
 * All app IDs are opaque UUID text (see src/lib/ids.ts). Timestamps are epoch-ms integers.
 * No runtime DDL: every table is declared here; dynamic BaaS data is schemaless JSON
 * stored in `baasRecords.data`. Keep rows small (<10KB per platform guidance) — larger
 * payloads belong in storage via `baasFiles`.
 *
 * After changes: edgespark db generate && edgespark db migrate
 */

import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // -> versions.id (nullable, circular: set null before deleting the target version)
  currentVersionId: text("current_version_id"),
  // PUBLIC, embedded in hosted sites for BaaS identification + rate limiting
  siteKey: text("site_key").notNull().unique(),
  spaMode: integer("spa_mode").notNull().default(0),
  lockVersion: integer("lock_version").notNull().default(0), // optimistic concurrency
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    parentVersionId: text("parent_version_id"), // -> versions.id; null = full deploy
    status: text("status").notNull(), // 'building' | 'ready' | 'failed' | 'superseded'
    note: text("note"),
    fileCount: integer("file_count").notNull().default(0),
    totalBytes: integer("total_bytes").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    committedAt: integer("committed_at"),
    expiresAt: integer("expires_at"), // building versions: createdAt + 24h
  },
  (t) => [index("idx_versions_site").on(t.siteId)]
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => versions.id),
    path: text("path").notNull(), // normalized, leading '/', validated in lib/pathNormalize
    hash: text("hash").notNull(), // -> content_blobs.hash
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
  },
  (t) => [
    unique("uq_files_version_path").on(t.versionId, t.path),
    index("idx_files_hash").on(t.hash),
    index("idx_files_version").on(t.versionId),
  ]
);

export const contentBlobs = sqliteTable("content_blobs", {
  hash: text("hash").primaryKey(),
  r2Key: text("r2_key").notNull(), // '<site_id>/<hash>' within the site_assets prefix
  refCount: integer("ref_count").notNull().default(0),
  firstUploadedAt: integer("first_uploaded_at").notNull(),
  lastVerifiedAt: integer("last_verified_at"),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(), // SHA-256 hex of a 256-bit random key
  prefix: text("prefix").notNull(), // display only, e.g. 'esk_ab12'
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const baasCollections = sqliteTable(
  "baas_collections",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    read: text("read").notNull(), // 'public' | 'private'
    write: text("write").notNull(), // 'public-append' | 'public' | 'private'
    maxRecords: integer("max_records"),
    // per-record byte cap; default aligns with the platform's "keep rows small" guidance
    maxBytes: integer("max_bytes").notNull().default(10240),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique("uq_collections_site_name").on(t.siteId, t.name)]
);

export const baasRecords = sqliteTable(
  "baas_records",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    collection: text("collection").notNull(),
    data: text("data").notNull(), // JSON string; <= collection.maxBytes enforced in app
    sourceIpHash: text("source_ip_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  // supports keyset pagination on (created_at, id) within a site+collection scope
  (t) => [index("idx_records_scope").on(t.siteId, t.collection, t.createdAt, t.id)]
);

export const baasFiles = sqliteTable(
  "baas_files",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    collection: text("collection"),
    r2Key: text("r2_key").notNull(), // '<site_id>/<file_id>/<filename>' within baas_uploads prefix
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadConfirmedAt: integer("upload_confirmed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_baas_files_scope").on(t.siteId, t.collection)]
);
