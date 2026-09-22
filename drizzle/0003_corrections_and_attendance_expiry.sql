ALTER TABLE `attendance` ADD COLUMN `voided_at` integer;
--> statement-breakpoint
ALTER TABLE `attendance` ADD COLUMN `voided_by` text REFERENCES `users`(`id`);
--> statement-breakpoint
ALTER TABLE `attendance` ADD COLUMN `void_reason` text;
--> statement-breakpoint
ALTER TABLE `class_sessions` ADD COLUMN `attendance_duration_minutes` integer NOT NULL DEFAULT 480;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_transactions_single_reversal` ON `point_transactions` (`reverses_transaction_id`) WHERE `reverses_transaction_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_attendance_session_active` ON `attendance` (`session_id`,`recorded_at`) WHERE `voided_at` IS NULL;
--> statement-breakpoint
PRAGMA optimize;
