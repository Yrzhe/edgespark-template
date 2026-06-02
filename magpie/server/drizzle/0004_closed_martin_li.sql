ALTER TABLE `assets` ADD `agent_run_id` text;--> statement-breakpoint
CREATE INDEX `idx_assets_agent_run` ON `assets` (`agent_run_id`);