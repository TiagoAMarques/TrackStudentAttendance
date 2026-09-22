
CREATE TABLE `student_identity_links` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`student_id` text NOT NULL,
	`linked_by` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `subject`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_identity_provider_student` ON `student_identity_links` (`provider`,`student_id`);
--> statement-breakpoint
-- Do not merge existing ambiguous identities or discard their history. These
-- guards prevent new collisions; the preflight report lists existing conflicts.
CREATE TRIGGER students_number_insert BEFORE INSERT ON students
WHEN EXISTS (SELECT 1 FROM students WHERE lower(trim(student_number))=lower(trim(NEW.student_number)))
BEGIN SELECT RAISE(ABORT,'Student number conflicts with an existing identity'); END;
--> statement-breakpoint
CREATE TRIGGER students_number_update BEFORE UPDATE OF student_number ON students
WHEN EXISTS (SELECT 1 FROM students WHERE id<>NEW.id AND lower(trim(student_number))=lower(trim(NEW.student_number)))
BEGIN SELECT RAISE(ABORT,'Student number conflicts with an existing identity'); END;
--> statement-breakpoint
CREATE TRIGGER sessions_single_open_insert BEFORE INSERT ON class_sessions
WHEN NEW.closed_at IS NULL AND (EXISTS (SELECT 1 FROM class_sessions WHERE course_id=NEW.course_id AND closed_at IS NULL) OR NOT EXISTS (SELECT 1 FROM courses WHERE id=NEW.course_id AND archived_at IS NULL))
BEGIN SELECT RAISE(ABORT,'An active course without an open session is required'); END;
--> statement-breakpoint
CREATE TRIGGER sessions_single_open_update BEFORE UPDATE OF closed_at,course_id ON class_sessions
WHEN NEW.closed_at IS NULL AND (EXISTS (SELECT 1 FROM class_sessions WHERE id<>NEW.id AND course_id=NEW.course_id AND closed_at IS NULL) OR NOT EXISTS (SELECT 1 FROM courses WHERE id=NEW.course_id AND archived_at IS NULL))
BEGIN SELECT RAISE(ABORT,'An active course without an open session is required'); END;
