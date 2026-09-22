ALTER TABLE `courses` ADD COLUMN `onboarding_token_digest` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_courses_onboarding_token` ON `courses` (`onboarding_token_digest`);
--> statement-breakpoint
ALTER TABLE `enrolments` ADD COLUMN `checked_in_at` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_enrolments_checked_in` ON `enrolments` (`course_id`,`checked_in_at`);
--> statement-breakpoint
PRAGMA optimize;
