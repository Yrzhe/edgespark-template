CREATE TABLE `image_upload_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_image_upload_intents_expires` ON `image_upload_intents` (`expires_at`,`confirmed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_image_upload_intent_pair` ON `image_upload_intents` (`image_id`,`asset_id`);