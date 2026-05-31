import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const teamProfiles = sqliteTable("team_profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  approvalStatus: text("approval_status").notNull().default("pending"),
  role: text("role").notNull().default("member"),
  signupMetadataJson: text("signup_metadata_json").notNull().default("{}"),
  rejectionReason: text("rejection_reason"),
  approvedBy: text("approved_by"),
  approvedAt: integer("approved_at"),
  rejectedBy: text("rejected_by"),
  rejectedAt: integer("rejected_at"),
  suspendedBy: text("suspended_by"),
  suspendedAt: integer("suspended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lockVersion: integer("lock_version").notNull().default(0),
}, (t) => [
  index("idx_team_profiles_status").on(t.approvalStatus, t.createdAt),
  index("idx_team_profiles_email").on(t.email),
]);

export const signupWhitelist = sqliteTable("signup_whitelist", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  addedBy: text("added_by").notNull(),
  addedAt: integer("added_at").notNull(),
  active: integer("active").notNull().default(1),
}, (t) => [unique("uq_signup_whitelist_kind_value").on(t.kind, t.value)]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  code: text("code").notNull(),
  message: text("message").notNull(),
  userId: text("user_id"),
  route: text("route"),
  metaJson: text("meta_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("idx_events_time").on(t.createdAt),
  index("idx_events_level_time").on(t.level, t.createdAt),
]);

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  archivedAt: integer("archived_at"),
  deletedAt: integer("deleted_at"),
  lockVersion: integer("lock_version").notNull().default(0),
}, (t) => [index("idx_agent_sessions_user_updated").on(t.userId, t.deletedAt, t.updatedAt)]);

export const palettes = sqliteTable("palettes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("team"),
  locked: integer("locked").notNull().default(0),
  colorsJson: text("colors_json").notNull(),
  ownerId: text("owner_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
}, (t) => [
  unique("uq_palettes_name_kind").on(t.name, t.kind),
  index("idx_palettes_kind_deleted").on(t.kind, t.deletedAt),
]);

export const assetFolders = sqliteTable("asset_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentFolderId: text("parent_folder_id"),
  depth: integer("depth").notNull().default(0),
  ownerUserId: text("owner_user_id").notNull(),
  systemKey: text("system_key"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (t) => [index("idx_asset_folders_parent").on(t.parentFolderId, t.deletedAt), index("idx_asset_folders_owner").on(t.ownerUserId, t.deletedAt)]);

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("image"),
  source: text("source").notNull().default("upload"),
  folderId: text("folder_id").references(() => assetFolders.id),
  ownerUserId: text("owner_user_id"),
  name: text("name").notNull().default("Untitled asset"),
  s3Uri: text("s3_uri").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  // Asset bytes lifecycle, independent of description status. "ready" = bytes are in R2 and
  // presignable; "generating" = async agent imagegen in flight (no bytes yet); "failed" = gen
  // errored. Pre-existing rows default to "ready" via the additive migration.
  status: text("status").notNull().default("ready"),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256"),
  transparent: integer("transparent").notNull().default(0),
  tagsJson: text("tags_json").notNull().default("[]"),
  description: text("description"),
  descriptionSource: text("description_source"),
  descriptionGeneratedAt: integer("description_generated_at"),
  provenanceJson: text("provenance_json").notNull().default("{}"),
  deletedAt: integer("deleted_at"),
  purgeAfter: integer("purge_after"),
  lockVersion: integer("lock_version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_assets_kind_owner").on(t.kind, t.ownerUserId),
  index("idx_assets_folder_deleted").on(t.folderId, t.deletedAt),
  index("idx_assets_sha").on(t.sha256),
]);

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").references(() => agentSessions.id),
  cardId: text("card_id"),
  plannedParentCardId: text("planned_parent_card_id"),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4o-mini"),
  state: text("state").notNull().default("queued"),
  prompt: text("prompt").notNull(),
  planJson: text("plan_json").notNull().default("{}"),
  toolsJson: text("tools_json").notNull().default("[]"),
  costMicros: integer("cost_micros").notNull().default(0),
  outputRefsJson: text("output_refs_json").notNull().default("[]"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("idx_agent_runs_user_created").on(t.userId, t.createdAt),
  index("idx_agent_runs_session").on(t.sessionId, t.createdAt),
  index("idx_agent_runs_state").on(t.state, t.createdAt),
]);

export const brandRuleVersions = sqliteTable("brand_rule_versions", {
  id: text("id").primaryKey(),
  family: text("family").notNull().default("bloome"),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  active: integer("active").notNull().default(0),
  rulesJson: text("rules_json").notNull(),
  canonicalPaletteJson: text("canonical_palette_json").notNull().default("[]"),
  ownerNotes: text("owner_notes"),
  createdBy: text("created_by").notNull(),
  lockVersion: integer("lock_version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [unique("uq_brand_rules_family_version").on(t.family, t.version), index("idx_brand_rules_active").on(t.family, t.active)]);

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  cardRootId: text("card_root_id"),
  parentCardId: text("parent_card_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  creatorUserId: text("creator_user_id").notNull(),
  ratioPreset: text("ratio_preset").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  paletteId: text("palette_id").references(() => palettes.id),
  primaryAssetId: text("primary_asset_id").references(() => assets.id),
  cardSpecJson: text("card_spec_json").notNull(),
  slotAssignmentsJson: text("slot_assignments_json").notNull().default("{}"),
  copyBlockJson: text("copy_block_json").notNull().default("{}"),
  renderManifestJson: text("render_manifest_json").notNull().default("{}"),
  agentRunId: text("agent_run_id").notNull().references(() => agentRuns.id),
  templateVersion: text("template_version").notNull(),
  ruleVersionAtSave: text("rule_version_at_save").notNull().references(() => brandRuleVersions.id),
  ownerOverrideJson: text("owner_override_json"),
  lockVersion: integer("lock_version").notNull().default(0),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_cards_gallery").on(t.status, t.deletedAt, t.updatedAt),
  index("idx_cards_creator").on(t.creatorUserId, t.updatedAt),
  index("idx_cards_family").on(t.cardRootId, t.parentCardId),
]);

export const cardRuleReports = sqliteTable("card_rule_reports", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  ruleVersionId: text("rule_version_id").notNull().references(() => brandRuleVersions.id),
  reportJson: text("report_json").notNull(),
  pass: integer("pass").notNull().default(0),
  score: integer("score").notNull().default(0),
  ownerOverrideJson: text("owner_override_json"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_card_rule_reports_card").on(t.cardId), index("idx_card_rule_reports_pass").on(t.pass, t.createdAt)]);

export const costLedger = sqliteTable("cost_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentRunId: text("agent_run_id"),
  provider: text("provider").notNull(),
  operation: text("operation").notNull(),
  units: integer("units").notNull().default(1),
  unitMicros: integer("unit_micros").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0),
  occurredAt: integer("occurred_at").notNull(),
  metaJson: text("meta_json").notNull().default("{}"),
}, (t) => [index("idx_cost_user_time").on(t.userId, t.occurredAt), index("idx_cost_provider_time").on(t.provider, t.occurredAt)]);

export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  scope: text("scope").notNull(),
  targetUserId: text("target_user_id"),
  tokenHash: text("token_hash"),
  createdBy: text("created_by").notNull(),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_shares_card").on(t.cardId, t.revokedAt), index("idx_shares_token").on(t.tokenHash)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const renoiseJobs = sqliteTable("renoise_jobs", {
  id: text("id").primaryKey(),
  primitiveKey: text("primitive_key").notNull(),
  status: text("status").notNull().default("queued"),
  recipeJson: text("recipe_json").notNull(),
  uploadPrefix: text("upload_prefix").notNull(),
  tokenHash: text("token_hash").notNull(),
  requestedBy: text("requested_by").notNull(),
  resultAssetId: text("result_asset_id"),
  errorMessage: text("error_message"),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lockVersion: integer("lock_version").notNull().default(0),
}, (t) => [index("idx_renoise_jobs_status").on(t.status, t.expiresAt), index("idx_renoise_jobs_token").on(t.tokenHash)]);
