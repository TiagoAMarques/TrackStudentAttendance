CREATE TABLE `pilot_rate_limits` (`client_key` text PRIMARY KEY NOT NULL,`window_started_at` integer NOT NULL,`failed_attempts` integer DEFAULT 0 NOT NULL,`blocked_until` integer);
--> statement-breakpoint
PRAGMA optimize;
