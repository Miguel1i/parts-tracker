CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`signup_mode` text DEFAULT 'approval' NOT NULL,
	`cron_interval_hours` integer DEFAULT 6 NOT NULL,
	`user_run_cooldown_minutes` integer DEFAULT 10 NOT NULL,
	`recent_check_skip_minutes` integer DEFAULT 30 NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`diff` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `blocklist` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`merchant_id` text,
	`url` text,
	`name` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocklist_pair_idx` ON `blocklist` (`product_id`,`merchant_id`);--> statement-breakpoint
CREATE TABLE `build_items` (
	`build_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`bought_at` integer,
	`bought_price` real,
	`bought_merchant_id` text,
	PRIMARY KEY(`build_id`, `product_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bought_merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `builds_user_idx` ON `builds` (`user_id`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`token` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_uq` ON `invites` (`token`);--> statement-breakpoint
CREATE INDEX `invites_email_idx` ON `invites` (`email`);--> statement-breakpoint
CREATE TABLE `match_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`price_eur` real,
	`score` real NOT NULL,
	`signals` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`run_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `match_candidates_status_idx` ON `match_candidates` (`status`);--> statement-breakpoint
CREATE INDEX `match_candidates_pair_idx` ON `match_candidates` (`product_id`,`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`country` text,
	`base_url` text NOT NULL,
	`search_template` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`shipping` real DEFAULT 0 NOT NULL,
	`free_shipping_over` real,
	`enabled` integer DEFAULT true NOT NULL,
	`visible_to_users` integer DEFAULT true NOT NULL,
	`own_only` integer DEFAULT false NOT NULL,
	`needs_browser` integer DEFAULT false NOT NULL,
	`adapter_config` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`color` text,
	`last_health` text,
	`last_health_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_slug_uq` ON `merchants` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_uq` ON `merchants` (`name`);--> statement-breakpoint
CREATE TABLE `price_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`ts` integer NOT NULL,
	`price_eur` real NOT NULL,
	`price_orig` real,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`shipping` real,
	`in_stock` integer DEFAULT true NOT NULL,
	`url` text,
	`title` text,
	`run_id` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `price_points_pair_ts_idx` ON `price_points` (`product_id`,`merchant_id`,`ts`);--> statement-breakpoint
CREATE TABLE `product_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`source_merchant_id` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_identifiers_uq` ON `product_identifiers` (`product_id`,`kind`,`value`);--> statement-breakpoint
CREATE INDEX `product_identifiers_lookup_idx` ON `product_identifiers` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `product_merchant` (
	`product_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`manual_url` text,
	`auto_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_status` text,
	`last_price_eur` real,
	`last_checked_at` integer,
	PRIMARY KEY(`product_id`, `merchant_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_merchant_merchant_idx` ON `product_merchant` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`query` text NOT NULL,
	`image_url` text,
	`ref_url` text,
	`brand` text,
	`ref_price` real,
	`created_by` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `scrape_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`product_id` text,
	`merchant_id` text,
	`status` text NOT NULL,
	`message` text,
	`log` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scrape_logs_run_idx` ON `scrape_logs` (`run_id`);--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`scope` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`requested_by` text,
	`started_at` integer,
	`finished_at` integer,
	`stats` text,
	`gh_run_url` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scrape_runs_created_idx` ON `scrape_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_merchants` (
	`user_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`user_id`, `merchant_id`),
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade
);
