# Teacher management and read-only test access

The implementation adds a Teachers page for administrators, persistent teacher accounts, and a shared Test Teacher account that an administrator creates with one click.

## Use

1. Sign in with a configured administrator's existing teacher code and open **Teachers**.
2. Choose **Create read-only test teacher**. Copy the generated shared code shown on screen and share it directly with the IT reviewers. It is displayed once and is not a hard-coded public password.
3. The test teacher uses the normal teacher login. It can browse every active course, records, students, timetables and exports. It cannot mutate application data, generate/rotate QRs, import, start/close sessions, award/correct points, or manage access.
4. To add a normal teacher, enter their name and email, optionally choose courses you own, and copy their generated code. They are added to the additional-teacher pool. They do not gain administrator rights.
5. Reset a managed account's code or disable it on the Teachers page. Both invalidate existing sessions. Re-enabling does not reactivate old sessions.

Read-only access includes teacher-visible personal information and downloads in **all active courses**, as requested. Share its code only with the intended reviewers. The public student-number pilot remains a separate anonymous flow: this feature does not fix all findings in the migration assessment or prevent an anonymous visitor using that existing flow after signing out.

## Configuration and deployment

Apply `drizzle/0011_teacher_accounts.sql` before the updated application is served. This is an additive migration generated from the new table definition; existing migrations were not rewritten. The pre-existing schema drift remains documented in the assessment.

Existing `PILOT_TEACHERS_JSON` codes remain valid. `PILOT_ADMIN_IDS` optionally lists the IDs allowed to manage teachers, separated by commas. If omitted, the first configured teacher is the administrator. With the legacy single-code configuration, `local-pilot-teacher` is the administrator. Managed accounts cannot make other accounts administrators.

Keep `PILOT_TEACHER_SECRET` stable and secret: it signs sessions and keyed access-code digests. New access codes have 80 random bits and only a keyed digest is stored. Rotating the signing secret invalidates sessions and requires managed account codes to be reset. No access code is embedded in source, exports, documentation or the browser's teacher directory.

New normal teachers without an assigned course retain the application's existing first-login course creation behaviour. The test teacher never creates courses or user rows while browsing. If there are no active courses, there is nothing for it to explore.

## Validation

`node qa/teacher-access.test.cjs` checks creation, duplicate prevention, authorised course assignment, administrator separation, directory protection, code reset, disable/re-enable, revoked sessions, read-only dashboard data and exports, and all sixteen mutation paths. It uses synthetic in-memory data and asserts that read-only operations leave all database tables unchanged.

The five existing points/student/distribution suites and TypeScript check also pass. This does not constitute closure of the wider security assessment.
