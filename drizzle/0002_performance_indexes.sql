CREATE UNIQUE INDEX IF NOT EXISTS `idx_awards_token` ON `point_awards` (`token_digest`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_entity_action_created` ON `audit_log` (`entity_id`,`action`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
