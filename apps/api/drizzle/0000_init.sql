CREATE TABLE `agent_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`skill_ids` text NOT NULL,
	`memory` text NOT NULL,
	`toolsets` text NOT NULL,
	`max_turns` integer NOT NULL,
	`timeout_seconds` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`suite_id` text NOT NULL,
	`suite_name` text NOT NULL,
	`suite_hash` text NOT NULL,
	`tasks` text NOT NULL,
	`baseline` text NOT NULL,
	`candidate` text NOT NULL,
	`repetitions` integer NOT NULL,
	`practical_margin` real NOT NULL,
	`seed` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_events_run_sequence_idx` ON `run_events` (`run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `run_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`scorer_index` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`weight` real NOT NULL,
	`passed` integer NOT NULL,
	`score` real NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_scores_run_idx` ON `run_scores` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`arm` text NOT NULL,
	`task_id` text NOT NULL,
	`task_key` text NOT NULL,
	`repetition` integer NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`termination` text,
	`error_kind` text,
	`error_message` text,
	`score` real,
	`passed` integer,
	`duration_ms` integer,
	`tokens` text,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`api_calls` integer,
	`cost_usd` real,
	`attempts` integer DEFAULT 0 NOT NULL,
	`not_before` text,
	`exit_code` integer,
	`final_output` text,
	`reported_model` text,
	`session_id` text,
	`stderr_tail` text,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_experiment_status_idx` ON `runs` (`experiment_id`,`status`);--> statement-breakpoint
CREATE INDEX `runs_experiment_sequence_idx` ON `runs` (`experiment_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);--> statement-breakpoint
CREATE TABLE `suites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`position` integer NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`fixtures` text NOT NULL,
	`scorers` text NOT NULL,
	`pass_threshold` real NOT NULL,
	`tags` text NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_suite_key_idx` ON `tasks` (`suite_id`,`key`);