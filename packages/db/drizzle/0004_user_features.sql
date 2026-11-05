CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_build_id` text,
	`price_with_shipping` integer DEFAULT true NOT NULL,
	`locale` text,
	`theme` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `builds` ADD `share_token` text;--> statement-breakpoint
ALTER TABLE `builds` ADD `updated_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `builds_share_token_uq` ON `builds` (`share_token`);--> statement-breakpoint
CREATE INDEX `build_items_product_idx` ON `build_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `scrape_runs_requested_idx` ON `scrape_runs` (`requested_by`,`created_at`);