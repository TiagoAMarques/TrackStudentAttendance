CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL,`email` text NOT NULL,`display_name` text NOT NULL,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `courses` (`id` text PRIMARY KEY NOT NULL,`code` text NOT NULL,`name` text NOT NULL,`owner_id` text NOT NULL REFERENCES `users`(`id`),`archived_at` integer,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_courses_owner` ON `courses` (`owner_id`);
--> statement-breakpoint
CREATE TABLE `course_teachers` (`course_id` text NOT NULL REFERENCES `courses`(`id`) ON DELETE cascade,`teacher_id` text NOT NULL REFERENCES `users`(`id`),`role` text NOT NULL,`invited_by` text NOT NULL REFERENCES `users`(`id`),`joined_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_course_teacher_unique` ON `course_teachers` (`course_id`,`teacher_id`);
--> statement-breakpoint
CREATE TABLE `students` (`id` text PRIMARY KEY NOT NULL,`student_number` text NOT NULL,`name` text NOT NULL,`email` text,`user_id` text REFERENCES `users`(`id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_number` ON `students` (`student_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_user` ON `students` (`user_id`);
--> statement-breakpoint
CREATE TABLE `enrolments` (`course_id` text NOT NULL REFERENCES `courses`(`id`) ON DELETE cascade,`student_id` text NOT NULL REFERENCES `students`(`id`),`active` integer DEFAULT true NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_enrolment_unique` ON `enrolments` (`course_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE `class_sessions` (`id` text PRIMARY KEY NOT NULL,`course_id` text NOT NULL REFERENCES `courses`(`id`),`title` text NOT NULL,`room` text,`attendance_token_digest` text NOT NULL,`attendance_expires_at` integer NOT NULL,`opened_by` text NOT NULL REFERENCES `users`(`id`),`opened_at` integer NOT NULL,`closed_at` integer);
--> statement-breakpoint
CREATE INDEX `idx_sessions_course_opened` ON `class_sessions` (`course_id`,`opened_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_attendance_token` ON `class_sessions` (`attendance_token_digest`);
--> statement-breakpoint
CREATE TABLE `attendance` (`id` text PRIMARY KEY NOT NULL,`session_id` text NOT NULL REFERENCES `class_sessions`(`id`),`student_id` text NOT NULL REFERENCES `students`(`id`),`recorded_by` text NOT NULL REFERENCES `users`(`id`),`source` text NOT NULL,`identity_verification` text DEFAULT 'institutional' NOT NULL,`recorded_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_session_student` ON `attendance` (`session_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE `point_awards` (`id` text PRIMARY KEY NOT NULL,`session_id` text NOT NULL REFERENCES `class_sessions`(`id`),`points` integer NOT NULL,`reason` text NOT NULL,`token_digest` text NOT NULL,`awarded_by` text NOT NULL REFERENCES `users`(`id`),`expires_at` integer NOT NULL,`closed_at` integer,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_awards_session_created` ON `point_awards` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `point_transactions` (`id` text PRIMARY KEY NOT NULL,`award_id` text REFERENCES `point_awards`(`id`),`course_id` text NOT NULL REFERENCES `courses`(`id`),`student_id` text NOT NULL REFERENCES `students`(`id`),`points` integer NOT NULL,`reason` text NOT NULL,`recorded_by` text NOT NULL REFERENCES `users`(`id`),`identity_verification` text DEFAULT 'institutional' NOT NULL,`reverses_transaction_id` text,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transaction_award_student` ON `point_transactions` (`award_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_course_student` ON `point_transactions` (`course_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE `leaderboard_preferences` (`course_id` text NOT NULL REFERENCES `courses`(`id`) ON DELETE cascade,`student_id` text NOT NULL REFERENCES `students`(`id`),`visibility` text DEFAULT 'private' NOT NULL,`alias` text);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leaderboard_student` ON `leaderboard_preferences` (`course_id`,`student_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leaderboard_alias` ON `leaderboard_preferences` (`course_id`,`alias`);
--> statement-breakpoint
CREATE TABLE `audit_log` (`id` text PRIMARY KEY NOT NULL,`course_id` text NOT NULL REFERENCES `courses`(`id`),`actor_id` text NOT NULL REFERENCES `users`(`id`),`action` text NOT NULL,`entity_type` text NOT NULL,`entity_id` text NOT NULL,`details` text,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_audit_course_created` ON `audit_log` (`course_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
