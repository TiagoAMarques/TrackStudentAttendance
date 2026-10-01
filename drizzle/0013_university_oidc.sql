CREATE TABLE `oidc_auth_requests` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oidc_auth_requests_expiry` ON `oidc_auth_requests` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `oidc_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`teacher_access` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oidc_sessions_expiry` ON `oidc_sessions` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_oidc_sessions_identity` ON `oidc_sessions` (`issuer`,`subject`);
