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
CREATE TABLE `baas_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`read` text NOT NULL,
	`write` text NOT NULL,
	`max_records` integer,
	`max_bytes` integer DEFAULT 10240 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collections_site_name` ON `baas_collections` (`site_id`,`name`);--> statement-breakpoint
CREATE TABLE `baas_files` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`collection` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`upload_confirmed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_baas_files_scope` ON `baas_files` (`site_id`,`collection`);--> statement-breakpoint
CREATE TABLE `baas_records` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`collection` text NOT NULL,
	`data` text NOT NULL,
	`source_ip_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_scope` ON `baas_records` (`site_id`,`collection`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `content_blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`ref_count` integer DEFAULT 0 NOT NULL,
	`first_uploaded_at` integer NOT NULL,
	`last_verified_at` integer
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_files_hash` ON `files` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_files_version` ON `files` (`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_files_version_path` ON `files` (`version_id`,`path`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`current_version_id` text,
	`site_key` text NOT NULL,
	`spa_mode` integer DEFAULT 0 NOT NULL,
	`lock_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_site_key_unique` ON `sites` (`site_key`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`parent_version_id` text,
	`status` text NOT NULL,
	`note` text,
	`file_count` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`committed_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_versions_site` ON `versions` (`site_id`);