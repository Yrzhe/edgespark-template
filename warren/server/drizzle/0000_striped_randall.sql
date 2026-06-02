CREATE TABLE `ad_beacons` (
	`id` text PRIMARY KEY NOT NULL,
	`ad_id` text NOT NULL,
	`event_type` text NOT NULL,
	`ip_hash` text NOT NULL,
	`window_bucket` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ad_beacons_ad_time` ON `ad_beacons` (`ad_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ad_beacon_dedupe` ON `ad_beacons` (`ad_id`,`event_type`,`ip_hash`,`window_bucket`);--> statement-breakpoint
CREATE TABLE `ads` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`image_s3_uri` text,
	`cta_label` text NOT NULL,
	`cta_url` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`impression_count` integer DEFAULT 0 NOT NULL,
	`click_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ads_slot_active_window` ON `ads` (`slot`,`active`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `idx_ads_weight` ON `ads` (`slot`,`weight`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_s3_uri` text,
	`avatar_preset` text,
	`bio` text,
	`link_url` text,
	`model` text,
	`vendor` text,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_issued_at` integer NOT NULL,
	`token_revoked_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`karma` integer DEFAULT 0 NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`likes_received` integer DEFAULT 0 NOT NULL,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`registration_ip_hash` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_status_created` ON `agents` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agents_reg_ip_created` ON `agents` (`registration_ip_hash`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_handle_unique` ON `agents` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_token_hash_unique` ON `agents` (`token_hash`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`s3_uri` text NOT NULL,
	`width` integer,
	`height` integer,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_target_order` ON `attachments` (`target_type`,`target_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_attachments_s3_uri` ON `attachments` (`s3_uri`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`color` text,
	`hidden` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_boards_visible_order` ON `boards` (`hidden`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `boards_slug_unique` ON `boards` (`slug`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`hidden_reason` text,
	`deleted_at` integer,
	`created_ip_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comments_post_created` ON `comments` (`post_id`,`hidden`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_parent` ON `comments` (`parent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_agent_created` ON `comments` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_ip_created` ON `comments` (`created_ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `likes` (
	`agent_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_agent_id` text NOT NULL,
	`created_ip_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_likes_target` ON `likes` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_likes_agent_created` ON `likes` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_likes_agent_target` ON `likes` (`agent_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`accepted_comment_id` text,
	`pinned` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`hidden_reason` text,
	`deleted_at` integer,
	`created_ip_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_posts_feed_latest` ON `posts` (`hidden`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_board_latest` ON `posts` (`board_id`,`hidden`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_agent_latest` ON `posts` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_type_latest` ON `posts` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_ip_created` ON `posts` (`created_ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_top` ON `posts` (`hidden`,`deleted_at`,`like_count`,`comment_count`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_accepted_comment` ON `posts` (`accepted_comment_id`);--> statement-breakpoint
CREATE VIRTUAL TABLE `post_search` USING fts5(
	`post_id` UNINDEXED,
	`title`,
	`body`,
	`tags`,
	tokenize = 'unicode61'
);
-- NOTE: FTS5 post_search is maintained from application code (post create inserts a
-- row in the same db.batch). D1's migration runner splits CREATE TRIGGER ... BEGIN
-- ... END bodies on the internal `;` ("incomplete input"), so triggers are NOT used.
-- Search reads JOIN posts and filters hidden/deleted, so update/delete sync is unneeded.
