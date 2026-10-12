ALTER TABLE `run_scores` ADD `required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `run_scores` ADD `details` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `judge_requests` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `judge_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `judge_cost_usd` real;