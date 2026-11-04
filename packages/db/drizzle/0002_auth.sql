CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
-- Placeholder owner for data imported before auth existed (milestone 2). It is banned and can't
-- sign in; `pnpm seed:admin --email ...` moves its rows to the first admin and deletes it.
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `role`, `status`, `banned`, `ban_reason`)
SELECT 'legacy-admin', 'Legacy admin', 'legacy-admin@invalid.local', 0, 'user', 'pending', 1, 'Placeholder for legacy data'
WHERE EXISTS (SELECT 1 FROM `builds` WHERE `user_id` = 'legacy-admin')
   OR EXISTS (SELECT 1 FROM `products` WHERE `created_by` = 'legacy-admin')
   OR EXISTS (SELECT 1 FROM `user_merchants` WHERE `user_id` = 'legacy-admin')
   OR EXISTS (SELECT 1 FROM `invites` WHERE `invited_by` = 'legacy-admin')
   OR EXISTS (SELECT 1 FROM `audit_log` WHERE `actor_user_id` = 'legacy-admin')
   OR EXISTS (SELECT 1 FROM `scrape_runs` WHERE `requested_by` = 'legacy-admin');--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
ALTER TABLE `audit_log` ALTER COLUMN "actor_user_id" TO "actor_user_id" text REFERENCES user(id) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `builds` ALTER COLUMN "user_id" TO "user_id" text NOT NULL REFERENCES user(id) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invites` ALTER COLUMN "invited_by" TO "invited_by" text NOT NULL REFERENCES user(id) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ALTER COLUMN "created_by" TO "created_by" text REFERENCES user(id) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scrape_runs` ALTER COLUMN "requested_by" TO "requested_by" text REFERENCES user(id) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_merchants` ALTER COLUMN "user_id" TO "user_id" text NOT NULL REFERENCES user(id) ON DELETE cascade ON UPDATE no action;