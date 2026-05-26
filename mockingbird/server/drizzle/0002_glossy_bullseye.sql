CREATE TABLE `preview_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_preview_rate_limit_principal` ON `preview_rate_limits` (`principal_key`,`window_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preview_rate_limit_window` ON `preview_rate_limits` (`principal_key`,`window_start`);--> statement-breakpoint
ALTER TABLE `analytics_events` ADD `is_owner` integer DEFAULT 0 NOT NULL;