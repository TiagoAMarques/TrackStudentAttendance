ALTER TABLE `point_transactions` ADD COLUMN `manual_session_id` text REFERENCES `class_sessions`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_manual_session` ON `point_transactions` (`manual_session_id`) WHERE `manual_session_id` IS NOT NULL;
--> statement-breakpoint
PRAGMA optimize;
