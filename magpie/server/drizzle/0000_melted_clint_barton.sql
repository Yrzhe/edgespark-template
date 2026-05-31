CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`card_id` text,
	`planned_parent_card_id` text,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model` text DEFAULT 'gpt-4o-mini' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`prompt` text NOT NULL,
	`plan_json` text DEFAULT '{}' NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`output_refs_json` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_user_created` ON `agent_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_runs_session` ON `agent_runs` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_runs_state` ON `agent_runs` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`lock_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_user_updated` ON `agent_sessions` (`user_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `asset_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_folder_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`owner_user_id` text NOT NULL,
	`system_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_asset_folders_parent` ON `asset_folders` (`parent_folder_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_asset_folders_owner` ON `asset_folders` (`owner_user_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`source` text DEFAULT 'upload' NOT NULL,
	`folder_id` text,
	`owner_user_id` text,
	`name` text DEFAULT 'Untitled asset' NOT NULL,
	`s3_uri` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`sha256` text,
	`transparent` integer DEFAULT 0 NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`description` text,
	`description_source` text,
	`description_generated_at` integer,
	`provenance_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`purge_after` integer,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `asset_folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_kind_owner` ON `assets` (`kind`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_assets_folder_deleted` ON `assets` (`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_assets_sha` ON `assets` (`sha256`);--> statement-breakpoint
CREATE TABLE `brand_rule_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`family` text DEFAULT 'bloome' NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`rules_json` text NOT NULL,
	`canonical_palette_json` text DEFAULT '[]' NOT NULL,
	`owner_notes` text,
	`created_by` text NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_brand_rules_active` ON `brand_rule_versions` (`family`,`active`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_brand_rules_family_version` ON `brand_rule_versions` (`family`,`version`);--> statement-breakpoint
CREATE TABLE `card_rule_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`report_json` text NOT NULL,
	`pass` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`owner_override_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_version_id`) REFERENCES `brand_rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_card_rule_reports_card` ON `card_rule_reports` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_card_rule_reports_pass` ON `card_rule_reports` (`pass`,`created_at`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`card_root_id` text,
	`parent_card_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`creator_user_id` text NOT NULL,
	`ratio_preset` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`palette_id` text,
	`primary_asset_id` text,
	`card_spec_json` text NOT NULL,
	`slot_assignments_json` text DEFAULT '{}' NOT NULL,
	`copy_block_json` text DEFAULT '{}' NOT NULL,
	`render_manifest_json` text DEFAULT '{}' NOT NULL,
	`agent_run_id` text NOT NULL,
	`template_version` text NOT NULL,
	`rule_version_at_save` text NOT NULL,
	`owner_override_json` text,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`palette_id`) REFERENCES `palettes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_version_at_save`) REFERENCES `brand_rule_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cards_gallery` ON `cards` (`status`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_cards_creator` ON `cards` (`creator_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_cards_family` ON `cards` (`card_root_id`,`parent_card_id`);--> statement-breakpoint
CREATE TABLE `cost_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_run_id` text,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`unit_micros` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`occurred_at` integer NOT NULL,
	`meta_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cost_user_time` ON `cost_ledger` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_cost_provider_time` ON `cost_ledger` (`provider`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `palettes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'team' NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`colors_json` text NOT NULL,
	`owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_palettes_kind_deleted` ON `palettes` (`kind`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_palettes_name_kind` ON `palettes` (`name`,`kind`);--> statement-breakpoint
CREATE TABLE `renoise_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`primitive_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`recipe_json` text NOT NULL,
	`upload_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`requested_by` text NOT NULL,
	`result_asset_id` text,
	`error_message` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_renoise_jobs_status` ON `renoise_jobs` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_renoise_jobs_token` ON `renoise_jobs` (`token_hash`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`scope` text NOT NULL,
	`target_user_id` text,
	`token_hash` text,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_shares_card` ON `shares` (`card_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `idx_shares_token` ON `shares` (`token_hash`);--> statement-breakpoint
CREATE TABLE `team_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`signup_metadata_json` text DEFAULT '{}' NOT NULL,
	`rejection_reason` text,
	`approved_by` text,
	`approved_at` integer,
	`rejected_by` text,
	`rejected_at` integer,
	`suspended_by` text,
	`suspended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_profiles_email_unique` ON `team_profiles` (`email`);--> statement-breakpoint
CREATE INDEX `idx_team_profiles_status` ON `team_profiles` (`approval_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_team_profiles_email` ON `team_profiles` (`email`);