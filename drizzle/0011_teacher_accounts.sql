
CREATE TABLE `teacher_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`code_digest` text NOT NULL,
	`disabled_at` integer,
	`session_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_teacher_accounts_email` ON `teacher_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_teacher_accounts_code` ON `teacher_accounts` (`code_digest`);