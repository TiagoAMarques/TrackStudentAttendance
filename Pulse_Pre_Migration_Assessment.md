# Pulse Attendance: pre-migration assessment

Assessed 11 September 2026. Scope: the local application, database migrations, dependencies, automated checks and university-hosting readiness. This is an engineering assessment, not a penetration-test certification.

## Decision

**Pulse is a functioning pilot, but it is not ready for production migration with real student data.** The existing functional checks and production build pass. However, this assessment reproduced eleven issues involving identity disclosure, attendance corrections, roster integrity, exports and recovery. University hosting will give IT control over infrastructure; it will not itself resolve these application issues.

Proceed with an isolated university staging environment using synthetic data. Make production cutover conditional on the acceptance gates below. Stabilise the current workflows before adding more features.

No application source fixes or deployments were made during this assessment. The added diagnostic scripts and this report document the current state. Existing user-authorised test settings remain unchanged.

## What is working

- Teacher operations generally check course access; this is a useful foundation for explicit university roles.
- Pilot teacher sessions use signed cookies with HttpOnly, SameSite and production Secure settings.
- The application has migration SQL and meaningful automated coverage for points, corrections and student distributions.
- Course onboarding has a persistent QR credential, distinct from short-lived attendance credentials. Moving hosts must preserve that credential as well as account for the old URL.
- The student distribution feature aggregates scores instead of returning the individual league table. Personal score identification remains deferred.
- A fresh production build and TypeScript check passed.

These positives do not establish end-to-end security or recovery readiness.

## Confirmed defects

The following were reproduced against synthetic in-memory SQLite data through the application functions. They were not tested by attacking the live service. P1 means resolve before real-data production use; P2 means resolve before declaring the migration complete.

| ID | Priority | Observed behaviour and consequence | Required result |
| --- | --- | --- | --- |
| A01 | P1 | A valid attendance QR plus a student number is enough to redeem attendance and return the matched student's full name. Knowledge of a number is being used as identity. | Authenticate the student and derive their identity server-side; another number must never allow impersonation or reveal that person's details. If anonymous check-in remains a test option, isolate it from production. |
| A02 | P1 | Rescanning an attendance QR restores attendance that a teacher voided and clears its correction fields. | A student rescan must preserve the teacher correction. Restoration must be an explicit authorised action with an audit trail. |
| A03 | P1 | A still-open attendance token works after the course is archived. | Redemption must atomically enforce course and session eligibility; archiving must prevent subsequent writes. |
| A04 | P1 | Two simultaneous manual session starts create two active sessions for the same course. | Enforce the one-active-session rule at the database/write boundary; the losing request receives a useful response. |
| A05 | P1 | Replacing a roster resets onboarding status for a student who remains enrolled. | Preserve retained students' joining state and history; remove only the memberships intended by the replacement. |
| A06 | P1 | A teacher's roster import in one course changes the global name/email of a student enrolled in another course. | Define who owns institutional identity fields. A course-scoped import must not silently modify identity across other courses. |
| A07 | P1 | An imported name beginning with `=1+1` is exported as a spreadsheet formula. CSV quoting does not neutralise it. | Apply a documented spreadsheet-safe export policy to untrusted cells, including formula-leading and control-character cases, while preserving useful data. |
| A08 | P1 | Importing `FC1` alongside `fc1` creates two identities; the case-insensitive redemption lookup then becomes ambiguous and fails. | Canonicalise identifiers consistently, enforce matching uniqueness, and resolve existing collisions explicitly before migrating. |
| A09 | P2 | When all allowed nicknames are occupied, a new student has no available choice and cannot complete onboarding. The production list has 225 entries, while the importer allows 2,000 students. | Expand the namespace or provide a deterministic fallback and verify onboarding at maximum supported cohort size. |
| A10 | P1 | The course “Full backup” omits onboarding credentials and other state required for complete restoration. | Label this as a course export or extend it; separately provide and prove a complete database recovery procedure. |
| A11 | P1 | An exported server function returns the pilot teacher directory without checking authentication. | Authorise the function itself, or remove it from the remotely callable server-action surface. Verify unauthorised HTTP calls on staging. |

Evidence: `qa/pre-migration-audit.cjs` and `outputs/assessment/probes.json`. The diagnostic assertions intentionally confirm defects; a passing diagnostic run does **not** mean these behaviours are acceptable. Convert each probe into a regression test asserting the corrected result during remediation.

Primary code locations: `app/actions.ts` (redemption, roster import, session start and nicknames), `app/pilot-auth.ts` (teacher directory), `app/course-records.ts` (backup contents), and `app/export/[courseId]/[kind]/route.ts` (CSV serialization).

For export remediation, see [OWASP's CSV injection guidance](https://owasp.org/www-community/attacks/CSV_Injection). Exported server functions require their own access checks; see the [Next.js server-component and action security guidance](https://nextjs.org/blog/security-nextjs-server-components-actions).

## Identity and authorisation: migration blockers

Code review found additional issues that need staging tests and design changes:

1. **Switching off pilot mode is not a university authentication implementation.** The other path relies on platform authentication headers. A VM must verify an institutional identity through an approved integration; it must not accept client-supplied identity headers. Put trusted-proxy boundaries and header stripping in the deployment design.
2. **Authentication and teaching permission are conflated.** `ensureTeacher` in `app/data.ts` creates a course for an authenticated principal without existing course access. This does not grant access to someone else's course, but it would automatically treat ordinary SSO users as potential teachers. Require an explicit staff role/allowlist and course membership.
3. **Identity linking is ambiguous.** The signed-in redemption path matches user ID or email and can select an email match already linked to another user. Use a stable institutional issuer/subject identifier and an explicit, collision-checked linking process. Do not silently merge identities by email.
4. **Verification labels need to reflect reality.** The non-pilot path writes `institutional` verification even though its present identity provider is the platform. Preserve historical provenance; do not relabel pilot records as university-authenticated during migration.
5. **Abuse controls are incomplete.** Pilot teacher login lacks application-level throttling. Student throttling counts unknown-number failures rather than all relevant abuse, and uses non-atomic counters. Edge protections were not verified. Review both application controls and IT's proxy controls, particularly classroom users sharing an IP.
6. **A legacy signed-in redemption path writes during page rendering.** Move state changes to explicit mutations and test refresh, retry, prefetch and duplicate submission behaviour.

Acceptance: unauthenticated, student, teacher and administrator requests have distinct tested permissions; students cannot query another student's identity or records; forged headers fail; role removal and session expiry take effect; identity collisions cannot silently attach the wrong record.

## Dependency security

A scan of 611 package names in the lockfile returned advisory matches for 11 package names: 41 advisories (2 critical, 20 high, 16 moderate, 3 low). **These counts are dependency matches, not 41 demonstrated exploits.** The scan sent package names and versions to the npm advisory service, not source code or student information. Results are dated and should be rescanned after upgrades.

Highest-priority triage:

- `react-server-dom-webpack` 19.2.6 falls within a high-severity Server Functions denial-of-service advisory, patched in 19.2.8. The app uses server actions/RSC, making this relevant to review even though the dependency is listed under development dependencies. No live exploit was attempted. See the [React maintainer advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g).
- `xlsx` 0.18.5 has prototype-pollution and regular-expression denial-of-service advisory matches. The app processes uploaded spreadsheet data in the teacher's browser; this finding is not evidence of unauthenticated server code execution. Select a maintained patched distribution or replace the parser. See [SheetJS's ReDoS advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363).
- `next` 16.2.6 has multiple matches. Some critical issues depend on AVIF optimisation or a specific Windows configuration. The live application uses Vinext, so those conditions must be checked rather than assumed. See the [Next.js August 2026 security release](https://nextjs.org/blog/august-2026-security-release).
- Vite/esbuild development-server advisories and transitive image/network-library matches need runtime reachability classification. They are not automatically vulnerabilities in the live Worker.

Upgrade the runtime stack as a compatible set, with a frozen lockfile, build and regression checks. Do not use a blind forced audit fix. Record affected runtime, exposure, resolution and any justified exception for each remaining advisory.

Evidence: `qa/dependency-assessment.cjs`, `outputs/assessment/dependency-advisories.json`.

## Database integrity and recovery

**The declarative schema differs from the applied migration schema.** Generating a database from `db/schema.ts` misses:

| Table | Missing from declarative schema |
| --- | --- |
| `class_sessions` | `attendance_duration_minutes` |
| `attendance` | `voided_at`, `voided_by`, `void_reason`; active-attendance index |
| `point_transactions` | `manual_session_id`; manual-session and single-reversal indexes |
| `audit_log` | Entity/action/time index |

This is not evidence that the live database lost these fields. It means using the declarative schema as a migration starting point could omit important state and constraints. Align the schema, migrations and migration metadata; prove that a fresh install and an upgraded install produce equivalent structures. Evidence: `outputs/assessment/schema-drift.json` and the generated SQL under `outputs/assessment/schema/`.

Several operations write business data and their audit entry separately. A failure between those writes can leave incomplete audit history and a misleading failure response. Review transaction boundaries and retry/idempotency rules, especially manual points. This is a code-review concern, not a fault-injection result from this assessment.

Course exports omit more than onboarding credentials, including some identity/session state. They are useful records exports but are not a substitute for disaster recovery. Before cutover, restore a complete backup into an isolated environment and reconcile courses, students, memberships, attendance, points, corrections, teachers and QR credentials. Protect secrets separately and document which credentials must survive migration versus which should rotate.

Agree backup frequency, retention, encryption, recovery time and acceptable data loss with IT. Test recovery instead of relying on successful backup-job messages.

## Workflow, scale and maintainability

- **Roster import:** the required filename suffix and five-column format are stricter than users expect. The previously reported `_Students.csv` file fails the `_participants.csv` naming rule, and its three columns also fail the required schema. Provide a downloadable template and a preflight preview with precise filename/header/row errors before changing data.
- **Upload limits:** the UI permits files up to 5 MB while the installed server-action entry defaults to a 1 MB body limit. Parsed payload size is not identical to file size, but this mismatch needs an actual HTTP boundary test and aligned limits.
- **Attendance QR display:** showing a QR rotates its token and extends its timer. Multiple teacher displays can invalidate one another. Decide whether display should retrieve the current QR and rotation should be a separate explicit action. This is separate from permanent course onboarding.
- **Records:** pagination currently fetches the full history and slices it on the client. Add server-side pagination/filtering and streamed or bounded exports before larger historical datasets accumulate.
- **Concurrency and capacity:** scheduled starts have a guard absent from manual starts. Test shared classroom Wi-Fi, simultaneous check-ins, duplicate requests, point awards and import limits under a representative load. No capacity claim is justified yet.
- **Accessibility:** modal semantics/focus handling need review, including accessible names, Escape and restoring focus. Fresh keyboard, screen-reader and real Android/iPhone testing remain outstanding.
- **Tooling:** no unified test command or CI workflow was found. A tracked roster test depends on a private local CSV fixture and exact row counts; replace that with synthetic fixtures for reproducibility. Pin the package-manager/toolchain version and document the supported build path.
- **Workspace hygiene:** expected participant filenames are ignored, but alternate student-export filenames are not broadly protected. No tracked CSV was found in this review; this is a prevention gap, not a finding of leaked records. Keep datasets and deployment archives out of source packages.

## Deliberate test policy requiring a production decision

The small-cohort and sparse-bin distribution safeguards were deliberately removed at the user's request for synthetic testing. This assessment has not reinstated them and does not classify their removal as an accidental defect.

Before using real grades, agree the public distribution policy with the university. Aggregation alone does not guarantee anonymity in a tiny class or when observers have outside knowledge. Decide whether public access, minimum cohort sizes or authenticated access are appropriate. Preserve the existing rule that students must not receive individual colleagues' records. Personal scores require properly verified identity.

## Validation performed and limits

| Check | Result |
| --- | --- |
| `qa/point-awards.test.cjs` | Passed |
| `qa/point-awards-d1.test.cjs` | Passed |
| `qa/student-course.test.cjs` | Passed |
| `qa/points-distribution.test.cjs` | Passed |
| `qa/distribution-page.test.cjs` | Passed |
| TypeScript `--noEmit` | Passed |
| Fresh production build from tracked source in an isolated temporary directory | Passed |
| Synthetic assessment probes | All 11 defects reproduced |
| ESLint over `app` and `db` | Failed: 8 errors, 1 warning; hook-state/effect and Next link rules |
| Schema comparison | Drift confirmed as listed above |
| Lockfile advisory scan | Completed; reachability review still required |
| Fresh local browser end-to-end run | Not completed: preview startup failed |

The Windows preview first failed on a Vite cache rename through the dependency junction. A temporary-only cache-directory adjustment then encountered a Rolldown duplicate-default-export error in an optimised RSC dependency. Application configuration was not changed. This limits fresh browser verification despite the successful production build; establish a clean supported Linux staging build and rerun browser checks there.

This review did not perform a live penetration test, restore a production database, benchmark load, audit university SSO, inspect all hosting/proxy controls, or test on physical mobile devices. Unit harnesses mock authentication and do not establish HTTP access-control correctness. Earlier browser checks are not counted as fresh passes here.

## Remediation order and acceptance gates

| Phase | Owner | Work and evidence required |
| --- | --- | --- |
| 1. Secure identities and dependencies | Application maintainer, with IT identity team | Resolve A01/A11; implement explicit roles and safe identity linking; upgrade/triage vulnerable dependencies. Staging HTTP tests prove denied access and forged-identity resistance. |
| 2. Correct business data | Application maintainer | Resolve A02–A09; make relevant writes atomic and retries safe. Convert diagnostics to regression tests, including concurrency and cross-course cases. |
| 3. Make recovery reliable | Application maintainer + IT | Resolve A10 and schema drift; restore a complete backup independently; reconcile records and QR credentials; document recovery objectives and procedure. |
| 4. Prepare the university runtime | Application maintainer + IT | Replace direct Workers/D1 dependencies with the chosen VM runtime/database adapter, configure institutional authentication, TLS/proxy boundaries and secrets. Produce a reproducible deployment package and staging environment. |
| 5. Prove operational readiness | Joint | CI is green; teacher/student browser workflows and mobile installation pass; representative load succeeds; monitoring, backup alerts, ownership and rollback are documented. |
| 6. Cut over deliberately | Joint | Freeze writes or use an agreed consistency procedure, take and validate a final backup, migrate, reconcile, smoke-test and retain a rollback point. Confirm domain, old QR-link handling and PWA reinstall/update behaviour. |

The earlier `Pulse_University_VM_Hosting_Brief.md` is an infrastructure starting point. Its sizing is provisional, and it is not a runnable VM deployment package. The current application imports `cloudflare:workers` and uses D1 directly; copying the existing build onto a VM is not sufficient.

**Production acceptance requires more than moving the host:** close the P1 findings, agree the real-data distribution policy, demonstrate recovery, and pass the target-environment identity and workflow tests. The assessed pilot can serve as the functional baseline throughout that work.
