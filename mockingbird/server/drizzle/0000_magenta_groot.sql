CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`theme_id` text,
	`selected_theme_id` text,
	`cache_key` text,
	`country` text,
	`lang_root` text,
	`device` text,
	`referrer_root` text,
	`hour_band` text,
	`is_returning` integer DEFAULT 0 NOT NULL,
	`bot_score` integer DEFAULT 0 NOT NULL,
	`user_agent_hash` text,
	`visitor_bucket_hash` text,
	`token_in` integer DEFAULT 0 NOT NULL,
	`token_out` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_time` ON `analytics_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_events_theme_time` ON `analytics_events` (`theme_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_events_type_time` ON `analytics_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `bio_blurbs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'owner' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bio_active_position` ON `bio_blurbs` (`deleted_at`,`is_active`,`position`);--> statement-breakpoint
CREATE TABLE `daily_analytics_rollups` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`event_type` text NOT NULL,
	`theme_id` text,
	`dimension` text NOT NULL,
	`dimension_value` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`token_in` integer DEFAULT 0 NOT NULL,
	`token_out` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_daily_rollup_day` ON `daily_analytics_rollups` (`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_rollup` ON `daily_analytics_rollups` (`day`,`event_type`,`theme_id`,`dimension`,`dimension_value`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`s3_uri` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`blurhash` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_images_kind_active` ON `images` (`kind`,`deleted_at`,`is_active`);--> statement-breakpoint
CREATE TABLE `match_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text NOT NULL,
	`expression` text NOT NULL,
	`compiled_json` text NOT NULL,
	`score` integer DEFAULT 10 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`explanation` text,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_match_rules_theme` ON `match_rules` (`theme_id`,`enabled`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_match_rules_enabled` ON `match_rules` (`enabled`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text NOT NULL,
	`url` text,
	`image_id` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_projects_status_position` ON `projects` (`deleted_at`,`status`,`position`);--> statement-breakpoint
CREATE TABLE `socials` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`handle` text,
	`icon_key` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_socials_active_position` ON `socials` (`deleted_at`,`is_active`,`position`);--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`layout_key` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`ab_weight` integer DEFAULT 100 NOT NULL,
	`palette_json` text NOT NULL,
	`font_json` text NOT NULL,
	`layout_config_json` text DEFAULT '{}' NOT NULL,
	`copy_prompt` text DEFAULT '' NOT NULL,
	`default_tone` text DEFAULT 'clear, warm, concise' NOT NULL,
	`fallback_copy_json` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `themes_slug_unique` ON `themes` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_themes_status_priority` ON `themes` (`status`,`deleted_at`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_themes_default` ON `themes` (`is_default`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `visitor_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`theme_id` text NOT NULL,
	`bucket_json` text NOT NULL,
	`selected_theme_id` text,
	`rewrite_json` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`rule_hash` text NOT NULL,
	`status` text DEFAULT 'fresh' NOT NULL,
	`token_in` integer DEFAULT 0 NOT NULL,
	`token_out` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`last_hit_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_cache_cache_key_unique` ON `visitor_cache` (`cache_key`);--> statement-breakpoint
CREATE INDEX `idx_cache_key_expires` ON `visitor_cache` (`cache_key`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_cache_theme_expires` ON `visitor_cache` (`theme_id`,`expires_at`);