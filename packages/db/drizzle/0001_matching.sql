ALTER TABLE `blocklist` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `product_identifiers` ADD `sightings` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_merchant` ADD `auto_url_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_merchant` ADD `last_match` text;--> statement-breakpoint
ALTER TABLE `products` ADD `match_spec` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Data fix: the legacy import marked learned GTIN/MPN codes as confirmed; they are unverified (docs/matching.md §8).
UPDATE `product_identifiers` SET `confirmed` = 0 WHERE `source` = 'learned' AND `kind` IN ('gtin', 'mpn');
