-- Read-only checks before applying the identity/integrity release.
-- Do not automatically merge students or close historical sessions.
SELECT lower(trim(student_number)) AS canonical_number, COUNT(*) AS conflicting_records
FROM students GROUP BY lower(trim(student_number)) HAVING COUNT(*) > 1;
SELECT course_id, COUNT(*) AS open_sessions
FROM class_sessions WHERE closed_at IS NULL GROUP BY course_id HAVING COUNT(*) > 1;
SELECT COUNT(*) AS legacy_identity_links_requiring_review FROM students WHERE user_id IS NOT NULL;
PRAGMA foreign_key_check;
