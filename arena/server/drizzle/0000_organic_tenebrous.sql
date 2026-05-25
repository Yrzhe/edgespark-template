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
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`text` text NOT NULL,
	`mentions` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_created_at` ON `comments` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_season` ON `comments` (`season_id`);--> statement-breakpoint
CREATE TABLE `competition` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`upstream_base_url` text NOT NULL,
	`voting_enabled` integer DEFAULT 1 NOT NULL,
	`comments_enabled` integer DEFAULT 1 NOT NULL,
	`active_season_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contestantTotals` (
	`season_id` text NOT NULL,
	`contestant_id` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`season_id`, `contestant_id`)
);
--> statement-breakpoint
CREATE TABLE `contestants` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`avatar_s3_uri` text,
	`accent_color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` integer PRIMARY KEY NOT NULL,
	`contestant_id` text NOT NULL,
	`symbol` text NOT NULL,
	`action` text NOT NULL,
	`qty` real,
	`price` real,
	`stop_loss` real,
	`profit_target` real,
	`risk_usd` real,
	`confidence` real,
	`confidence_num` integer,
	`reasoning` text DEFAULT '' NOT NULL,
	`justification` text DEFAULT '' NOT NULL,
	`chain_of_thought` text DEFAULT '' NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_contestant_created` ON `decisions` (`contestant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_decisions_created_at` ON `decisions` (`created_at`);--> statement-breakpoint
CREATE TABLE `owner_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`avatar_s3_uri` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upstreamCache` (
	`resource` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voteBuckets` (
	`season_id` text NOT NULL,
	`contestant_id` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`season_id`, `contestant_id`, `bucket_start`)
);
