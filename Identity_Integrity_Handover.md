# Identity and data integrity: implementation handover

Implemented locally, 12 September 2026. This release has not been deployed. It does not complete university SSO integration or the separate backup, dependency-upgrade and VM-migration phases.

## Changes

- **Attendance corrections:** student rescans never restore teacher-voided attendance. Only an explicit teacher entry can restore it, and the correction/restoration audit history is retained.
- **Active courses:** attendance eligibility is checked inside the write, so an archive between the initial lookup and insertion prevents attendance being recorded.
- **Sessions:** manual and scheduled starts are protected against concurrent active sessions by the write and database triggers. Existing duplicate sessions are not silently closed.
- **Roster replacement:** retained students keep their joined status, nicknames, attendance and points. Removed memberships become inactive without erasing their historical joined status.
- **Shared identities:** course imports cannot overwrite global student names/emails. Conflicting details reject the entire import before changes. Administrators can explicitly correct verified identity details on the Teachers page; the change is audited in every affected course.
- **Student numbers:** new IDs are trimmed and lowercased. Case variants reuse the existing identity. Database guards prevent new case/whitespace collisions. Existing ambiguous records require review rather than an automatic merge.
- **Exports:** spreadsheet formula-leading strings are neutralised in CSV exports. Numeric values, including negative points, remain numeric. Sensitive downloads use private/no-store caching.
- **Nickname capacity:** numbered animal variants become available when the initial names are taken; joining no longer stops at 225 nicknames. Onboarding state, nickname and onboarding audit are committed atomically.
- **Audit consistency:** manual attendance/points, corrections, reversals and session writes roll back if their audit insertion fails. Nickname/onboarding completion has the same transaction protection.
- **Retries:** manual submissions carry a stable request identifier. Repeating a submission, including simultaneous requests, does not add another points transaction. Reusing an identifier with different details is rejected.

## Identity boundaries

Student-number knowledge is not authentication. `PILOT_ALLOW_UNVERIFIED_STUDENTS` now defaults to disabled and must explicitly equal `true` to allow the legacy synthetic-test flow. Names have also been removed from that flow's responses. When deliberately enabled, the flow is still unverified and can expose synthetic nicknames; it is not suitable for real student identity protection.

`PILOT_MODE=true` continues to enable teacher-code login. It no longer implicitly enables unverified student submissions. The existing live site has not been changed by this local implementation. Deploying with no new configuration will disable the legacy student QR flow; decide the testing/production configuration before deployment.

The existing Sites identity-header path requires `AUTH_PROVIDER=sites`. It is disabled by default and must never be enabled on a bare university VM where visitors can supply those headers. University OIDC/SAML validation has not been implemented: IT must first provide the provider/protocol, issuer/metadata, application registration, allowed redirect URLs and staff-role mapping. Secrets should be transferred through an approved secret-management channel.

Signed student redemption now requires an explicit `(provider, subject)` link in `student_identity_links`. It never links by matching an email, and it does not trust old `students.user_id` links. Administrators can provision a reviewed Sites sign-in reference on the Teachers page while using pilot administration. A subject already linked to another student cannot be reassigned. These tools prepare the existing Sites provider; they are not university SSO. The legacy non-pilot onboarding path remains unavailable until the verified university joining workflow is integrated; existing joined students can use the signed attendance/points path after configuration and verified linking.

Opening the dashboard no longer turns an arbitrary authenticated visitor into a teacher. A verified pilot teacher or an existing explicit course-teacher membership is required. Student redemption is initiated by an explicit confirmation action, not by rendering a GET page. Provider provenance is recorded as `sites`, not incorrectly labelled `institutional`.

Teacher login and student test attempts are rate-limited with atomic counters. Only the provider-controlled client-IP header is used; arbitrary forwarded-IP headers are ignored. IT must provide a trusted proxy/address adapter on the VM. Rate limiting supplements identity verification; it does not replace it.

The read-only test teacher remains read-only, including for the new identity administration actions. Public aggregate score distributions retain the user-approved test policy.

## Migration and existing records

Apply `drizzle/0012_identity_integrity.sql` before serving the new application. It adds explicit identity links and guards; it does not delete, merge, relabel or backfill existing identities or historical attendance. The new table/index were generated from the schema. The trigger statements are reviewed custom SQLite guards; prior migrations are unchanged.

Run `ops/identity-integrity-preflight.sql` against a protected copy of the current database. Review existing canonical-ID collisions, multiple open sessions and legacy identity links before enabling real-data use. The regression tests verify that the migration preserves legacy conflicts, but the current production database has not been inspected or reconciled in this task. The earlier declarative-schema drift and full-backup deficiencies remain in the migration assessment backlog.

An import with mismatched identity fields must be corrected against a verified institutional source, or the administrator must update that identity explicitly. Importing a course is deliberately not an implicit authorisation to modify identities across courses.

## Verification

Passed checks:

- `qa/identity-integrity.test.cjs`: default-denied unverified access; no automatic email or legacy-ID linking; provider isolation; teacher access; rescans and corrections; archive/write race; manual retry idempotency; audit fault rollback; retained onboarding; cross-course import isolation; identifier guards; CSV safety; nickname exhaustion and onboarding rollback.
- `qa/identity-integrity-d1.test.cjs`: actual Workers/D1 runtime; migration preservation; simultaneous session starts; simultaneous manual retries; failed-audit rollback; atomic rate limits.
- `qa/teacher-access.test.cjs`: administrator-only linking/corrections, duplicate-link rejection, teacher credentials/revocation and unchanged read-only protections.
- Existing point-award, D1 point-award, student-course and aggregate-distribution regression suites.
- TypeScript and production build (see final task result).

These are synthetic automated tests, not a production penetration test, real university SSO test, physical-mobile test or load benchmark. University identity integration remains an explicit outstanding dependency; do not mark the complete identity finding closed until that integration is validated.
