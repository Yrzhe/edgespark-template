CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`link_id` text,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`referrer_host` text,
	`device_type` text,
	`country` text,
	`user_agent_hash` text,
	`ip_hash` text,
	`bot_score` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_page_time` ON `analytics_events` (`page_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_events_page_type_time` ON `analytics_events` (`page_id`,`event_type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_events_link_time` ON `analytics_events` (`link_id`,`occurred_at`);--> statement-breakpoint
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
CREATE TABLE `daily_analytics_rollups` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`page_id` text NOT NULL,
	`link_id` text,
	`event_type` text NOT NULL,
	`dimension` text NOT NULL,
	`dimension_value` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_daily_rollup_page_day` ON `daily_analytics_rollups` (`page_id`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_rollup` ON `daily_analytics_rollups` (`day`,`page_id`,`link_id`,`event_type`,`dimension`,`dimension_value`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`thumbnail_s3_uri` text,
	`position` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`is_featured` integer DEFAULT 0 NOT NULL,
	`link_kind` text DEFAULT 'link' NOT NULL,
	`deleted_at` integer,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_links_page_active_position` ON `links` (`page_id`,`deleted_at`,`is_active`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_links_page_position` ON `links` (`page_id`,`position`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text,
	`avatar_s3_uri` text,
	`cover_s3_uri` text,
	`social_links_json` text DEFAULT '[]' NOT NULL,
	`theme_json` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_pages_deleted_updated` ON `pages` (`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pages_default` ON `pages` (`is_default`);