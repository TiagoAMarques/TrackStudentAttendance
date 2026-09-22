-- Reviewed against Drizzle-generated schema delta; adapted for D1 deferred FKs
-- and an explicit old-column copy (new columns must not be read from old rows).
-- Preserve existing award IDs and transactions while allowing a null class.
-- point_transactions references this table without ON DELETE CASCADE.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE point_awards_new (
  id text PRIMARY KEY NOT NULL,
  session_id text REFERENCES class_sessions(id),
  course_id text REFERENCES courses(id),
  points integer NOT NULL,
  reason text NOT NULL,
  token_digest text NOT NULL,
  awarded_by text NOT NULL REFERENCES users(id),
  expires_at integer NOT NULL,
  closed_at integer,
  created_at integer NOT NULL,
  restricted integer NOT NULL DEFAULT 0 CHECK (restricted IN (0,1)),
  CHECK (session_id IS NOT NULL OR course_id IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO point_awards_new (id,session_id,points,reason,token_digest,awarded_by,expires_at,closed_at,created_at)
SELECT id,session_id,points,reason,token_digest,awarded_by,expires_at,closed_at,created_at FROM point_awards;
--> statement-breakpoint
DROP TABLE point_awards;
--> statement-breakpoint
ALTER TABLE point_awards_new RENAME TO point_awards;
--> statement-breakpoint
CREATE INDEX idx_awards_session_created ON point_awards(session_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_awards_token ON point_awards(token_digest);
--> statement-breakpoint
CREATE INDEX idx_awards_course_created ON point_awards(course_id,created_at);
--> statement-breakpoint
CREATE TABLE point_award_recipients (
  award_id text NOT NULL REFERENCES point_awards(id),
  student_id text NOT NULL REFERENCES students(id),
  PRIMARY KEY (award_id,student_id)
);
--> statement-breakpoint
PRAGMA defer_foreign_keys = OFF;
