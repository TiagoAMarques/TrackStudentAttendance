CREATE TABLE scheduled_classes (
 id TEXT PRIMARY KEY NOT NULL,
 course_id TEXT NOT NULL REFERENCES courses(id),
 class_id TEXT NOT NULL COLLATE NOCASE,
 class_date TEXT NOT NULL,
 week INTEGER NOT NULL,
 class_time TEXT NOT NULL,
 room TEXT NOT NULL,
 teacher TEXT NOT NULL,
 comments TEXT NOT NULL DEFAULT '',
 session_id TEXT REFERENCES class_sessions(id),
 imported_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 UNIQUE(course_id, class_id)
);
CREATE INDEX idx_scheduled_course_date ON scheduled_classes(course_id,class_date,class_time);
