# Pulse handover: live pilot and university SSO

Last updated: 10 September 2026.

## Where we paused

### Subsequent points-award changes (published as versions 22 and 23)

Tiago requested points QRs outside class sessions and an option to restrict any
points QR to one or more students. The implementation adds an award composer
with class/independent-coursework scope, all-joined/selected-students audience,
searchable recipient checkboxes, and visible creation errors. Independent awards
count toward course totals only. Restricted claims are enforced server-side in
both pilot and signed-in redemption, including the nickname-completion route.
Pilot identity still relies on the entered student number.

New migration: `drizzle/0008_independent_point_awards.sql`. It preserves award IDs
and transactions while making session association optional, and adds course
association and recipient restrictions. Reviewed against generated Drizzle SQL,
adapted for D1, and tested with synthetic history in both SQLite and D1/Workers.
Records, CSV event labels, backups, and reversals support independent coursework.

Tests: `node qa/point-awards.test.cjs` and
`node qa/point-awards-d1.test.cjs`. Build and TypeScript checks passed on the
implementation. Latest temporary build path is recorded in ignored
`outputs/points-awards-build-path.txt`; rebuild if the source has changed.
Version 22 was published successfully. Version 23 was then published successfully on 10 September 2026 (commit be7c35f02bed4c7b7085394645fee62c89865e5f). It adds 30-minute, until-class-close, and course-active expiry modes; teachers can deactivate QRs from the generated-code view or course records. Fixed timers on class awards still end when the class closes. Course-active mode survives class closure but stops on course archival or QR deactivation. Existing QRs retain their original timed expiry through migration 0009_point_award_expiry_modes.sql. Student-number lookup now accepts numeric and fc-prefixed forms, rejects ambiguous duplicate identities, and tells students not to enter an email address. A reported missing-roster error was consistent with this former exact-format mismatch, but the actual submitted input was not available. Live roster checks were read-only; all test claims used synthetic records.

Tiago is conducting a live test with real students. He has emailed university colleagues about connecting Pulse to university Single Sign-On (SSO). We are waiting for their response. No SSO implementation or authentication changes were made in this session.

The next task is to review their reply, settle the client configuration and data-protection requirements, and then implement and test the integration without disrupting the ongoing pilot.

## Current app and publication

- Live app / current Root URL: https://pulse-attendance.tiagoandremarques.chatgpt.site/
- Sites project ID: `appgprj_6a8fecd0c5a48191a9465667396d15ac` (reuse the existing project).
- Latest publication verified in this conversation: version **23**, successfully published on 10 September 2026.
- Published source commit: `be7c35f02bed4c7b7085394645fee62c89865e5f`.
- The earlier version 21 update applied the Ciências ULisboa blue palette across the app, QR rendering, favicon, and web app manifest. It did not change authentication or live teacher codes.
- Reference palette: primary `#0C4FB3`, navy `#052048`, pale blue `#CEDCF0`, blue tint `#E7EDF7`, ink `#13274D`, muted text `#374D6D`.
- Production build and selected text/background contrast checks passed. No browser visual QA was performed for the palette update.

Treat these as a dated snapshot; inspect the current source and live publication before resuming.

## Authentication today

The app is running in pilot mode. Teachers use access codes. Students enter their student number; this does **not** verify university identity. Pilot attendance and participation records are marked accordingly.

The code also has a non-pilot ChatGPT authentication path. That is not university OIDC and should not be mistaken for an existing university integration.

Relevant source:

- `app/pilot-auth.ts`: teacher code lookup and signed session cookie.
- `app/chatgpt-auth.ts`: current authentication abstraction and pilot/non-pilot routing.
- `app/pilot/login/page.tsx`: teacher login page.
- `app/PilotRedeem.tsx`: student pilot redemption interface.
- `app/actions.ts`: server-side actions, including pilot redemption.
- `db/schema.ts`: users, students, enrolments, attendance, points, and audit records.

### Why the side-panel login rejected Tiago's code

The panel initially showed `http://localhost:3000/`, using local `.env.local` configuration. A configuration-only check found **zero configured individual teachers** locally, with a generic fallback teacher code present. The published app has a separate secret teacher directory configured in Sites.

Therefore a live individual teacher code is not expected to work in that local preview. The panel was redirected to the published app, and the local development server was stopped. No teacher code was reset. Do not copy live secrets into this note or assume local and production credentials match.

## What university colleagues said

Their SSO team supports three authentication protocols and prefers **OpenID Connect**. They need the client's **Root URL** before creating the client. Remaining SSO answers depend on that registration. They also directed Tiago to the university RGPD impact-assessment service because Pulse processes personal data.

- Current Root URL to discuss: https://pulse-attendance.tiagoandremarques.chatgpt.site/
- University assessment service: https://balcaoc.ciencias.ulisboa.pt/servico/id=846/avaliacao.impacto.rgpd
- Existing local assessment workbook: `RGPD_AIPD_DPIA/PwC-UL_RGPD-IDOK AIPD ou DPIA_25102023_v03.xlsx`.

Tiago confirmed that he sent an email to colleagues. The exact text sent and any subsequent reply are not stored here. We have not received client configuration. Acceptance of the current hosting/domain has not been confirmed.

The assessment page did not expose readable instructions through the retrieval methods used. The workbook was located but not reviewed or completed during this discussion. Do not treat either the assessment or university approval as complete.

## What to obtain when they reply

1. Confirmation that the current domain/hosting is acceptable, or details of the required university-approved destination.
2. OIDC issuer and discovery URL; client ID; client authentication method and any required secret, delivered through an appropriate secure channel.
3. Exact permitted redirect/callback URI(s), post-logout URI(s), and any provider-specific requirements. Root URL is not the callback URL. No new university callback route has been implemented or agreed yet.
4. Available scopes and claims: a stable account identifier, and the authoritative attribute or approved process for mapping that identity to a roster student number.
5. Whether teacher identities/affiliations are also available, and how account changes and deactivation are handled.
6. Test client/accounts or an agreed test procedure, including any MFA or session/logout expectations.
7. The RGPD review process, responsible contacts, and any hosting or data-processing conditions.

Never put client secrets, teacher codes, session cookies, or tokens in source control, documentation, screenshots, or chat output.

## Intended SSO behavior and implementation boundaries

The intended student journey is: scan a classroom QR code, authenticate on the university's page if necessary, return to the original action, and record attendance/participation for the verified student identity. Pulse should not handle university passwords.

Implementation should use a maintained OIDC implementation compatible with the deployed runtime, Authorization Code flow with PKCE, appropriate state/nonce checks, full token validation, and secure server-managed sessions. Confirm the university's actual configuration before choosing the final integration details.

Map identities using the issuer and stable subject identifier, plus a trusted roster mapping. Do not allow a typed student number or an unverified email to establish ownership of a student record. Plan existing user/student linking and teacher ownership migration explicitly.

University login authenticates a person; it does not automatically grant teacher privileges, prove enrolment, or establish physical classroom presence. Continue enforcing course permissions, enrolment, token expiry, and duplicate-redemption protection on the server.

Do not simply disable `PILOT_MODE` to enable university SSO: the current non-pilot path uses ChatGPT authentication. Do not relabel historical pilot records as institutionally verified. Agree the transition and any fallback with Tiago before changing the live student flow.

## Data protection work still pending

SSO improves identity assurance but does not establish RGPD compliance on its own. Work with the university's data-protection team to document:

- Responsibility for processing, purposes, lawful basis, and student-facing information.
- The data collected and which identity claims are actually necessary.
- Access rights for teachers/students, retention, deletion, corrections, and audit access.
- Treatment and visibility of participation rankings and pseudonymous nicknames.
- Hosting suppliers, contractual arrangements, data locations, international transfers where relevant, and security/incident procedures.
- Whether a full AIPD/DPIA is required and how to complete the institution's assessment process.

Do not claim institutional approval or guaranteed compliance without the relevant review. No conclusion about the acceptability of the present hosting was reached.

Reference material discussed:

- OIDC specification: https://openid.net/specs/openid-connect-core-1_0.html
- EDPB DPIA guidance: https://www.edpb.europa.eu/topics/accountability-and-compliance-tools/data-protection-impact-assessment_en
- EDPB international transfers guidance: https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en

## Resume checklist

1. Read this note and Tiago's latest correspondence; verify current source, publication, and pilot status.
2. Collect pilot observations: login trouble, QR scanning, duplicates, incorrect attendance/points, and correction needs. No results of the live test have yet been recorded in this note.
3. Resolve hosting acceptance, OIDC registration, identity mapping, and data-protection requirements.
4. Prepare a separate test environment with test records. Preserve real pilot data; establish an appropriate backup and rollback plan before migrations or cutover.
5. Implement university authentication and explicit student/teacher authorization without silently changing live access.
6. Test successful and failed login, cancellation, expired sessions, account mismatch, teacher restrictions, roster linking, return to the original QR action, duplicate/expired redemption, logout, and historical-record preservation.
7. Coordinate a live cutover with Tiago and the university, then verify publication and the complete student journey.

## Local development and publishing notes

The existing app uses Vinext/Vite, React, and a Cloudflare Worker-compatible build with D1. Hosting configuration is in `.openai/hosting.json`. Reuse existing architecture, dependencies, and the Sites project. Read the available Sites skills before future deployment work.

On this Windows machine, the `pnpm dev` wrapper attempted an unnecessary dependency installation and failed. Running the installed CLI directly worked:

```powershell
node node_modules/vinext/dist/cli.js dev
node node_modules/vinext/dist/cli.js build
```

Builds inside the Dropbox workspace encountered `EBUSY` locks on `dist/.openai/drizzle`. A clean temporary build outside Dropbox, with the same source and a junction to the installed dependencies, succeeded. The prior temporary path is recorded in ignored `outputs/blue-theme-build-path.txt`; it is disposable and may no longer exist. Do not rely on an old archive after changing source.

The Sites packaging helper succeeded with Git Bash, `/usr/bin:/bin` on its PATH, and a **relative archive output path**; a Windows drive-letter archive path was interpreted by GNU tar as a remote destination. The saved version was built from the exact committed and pushed source. Deployment reached `succeeded` before handing over the live URL.

The workspace contains unrelated presentations, spreadsheets, and previous QA/build artifacts. Preserve them and stage only files belonging to the current change. This handover contains no credentials or student-level records.

## Student error messages: version 24
Published successfully on 10 September 2026, source commit 1aac8120b69de95a18396d630c8417c0a2afc4da. Student messages now identify JOIN (course joining), ATT (attendance), or PTS (points), with specific failure codes and next steps. See STUDENT_ERROR_REFERENCE.md for the reference. Tests cover join-first, closed/expired/unknown QR, course enrolment, recipient restrictions and joining with no open session. Build and TypeScript checks passed. No new database migration was needed for this release.
