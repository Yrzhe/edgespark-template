CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`user_id` text,
	`route` text,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_time` ON `events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_level_time` ON `events` (`level`,`created_at`);
