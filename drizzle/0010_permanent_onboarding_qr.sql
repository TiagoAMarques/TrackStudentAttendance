CREATE TABLE `course_onboarding_qrs` (
	`course_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`token_digest` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_course_onboarding_qrs_digest` ON `course_onboarding_qrs` (`token_digest`);
