CREATE TABLE `template_marketplace` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`title` text NOT NULL,
	`published_by_user_id` text NOT NULL,
	`author_display_name` text DEFAULT 'Magpie creator' NOT NULL,
	`thumbnail_asset_id` text,
	`use_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`unpublished_at` integer,
	`lock_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thumbnail_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_template_marketplace_card` ON `template_marketplace` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_template_marketplace_active` ON `template_marketplace` (`unpublished_at`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_template_marketplace_card` ON `template_marketplace` (`card_id`);
