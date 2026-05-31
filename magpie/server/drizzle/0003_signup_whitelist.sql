CREATE TABLE `signup_whitelist` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signup_whitelist_kind_value` ON `signup_whitelist` (`kind`,`value`);--> statement-breakpoint
INSERT INTO `signup_whitelist` (`id`, `kind`, `value`, `added_by`, `added_at`, `active`)
VALUES ('wl_seed_youware_domain', 'domain', '@youware.com', 'system', unixepoch() * 1000, 1)
ON CONFLICT (`kind`, `value`) DO UPDATE SET `active` = 1;
