CREATE TABLE `dailyRollups` (
	`season_id` text NOT NULL,
	`contestant_id` text NOT NULL,
	`day` text NOT NULL,
	`votes` integer DEFAULT 0 NOT NULL,
	`equity_open` real,
	`equity_close` real,
	PRIMARY KEY(`season_id`, `contestant_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `idx_daily_rollups_day` ON `dailyRollups` (`day`);--> statement-breakpoint
CREATE TABLE `draftVoters` (
	`season_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`season_id`, `user_id`)
);
