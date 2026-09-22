# Pulse Attendance — university VM hosting brief

Prepared: 11 September 2026. Purpose: infrastructure planning and migration scoping; this is not yet an installation runbook.

## Request to University IT

We would like to move Pulse Attendance, a web application for course enrolment, attendance and participation points, onto university-managed infrastructure. Students use their phones through a browser or an installable website (PWA); teachers manage courses and import rosters.

Please provision or propose a supported Linux VM, university DNS name and HTTPS endpoint, persistent database storage, restricted deployment access, backups and monitoring. We also need the university OpenID Connect details to replace the current pilot authentication.

**Important:** the current application is built for Cloudflare Workers and its D1 database. It is not a ready-to-run conventional Node.js application. A VM-compatible application release and database migration must be prepared and tested before installation. Moving the web frontend alone while retaining D1 would leave student data outside university hosting and would not meet the proposed objective.

## 1. Proposed deployment

Student/teacher browser → university HTTPS reverse proxy → Pulse Node.js application → local SQLite database on university-managed disk.

The application will connect over HTTPS to the university identity provider for SSO. A university-managed backup destination holds encrypted database backups.

Recommended initial approach: adapt the existing React/Next-compatible application to a supported, patched Next.js Node.js deployment, replace the Cloudflare database binding with a local SQLite adapter, and integrate university OIDC. This is a proposed target architecture, not functionality already delivered. Next.js supports self-hosting and recommends a reverse proxy in front of the application server. [Official self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).

SQLite is a reasonable starting choice for one application instance on one VM. If IT requires managed PostgreSQL, multiple application instances, high availability or substantial simultaneous write traffic, agree that before implementation; PostgreSQL needs additional query/schema migration work. Do not place an active SQLite database on an SMB/NFS share or expose it directly to clients. See [SQLite deployment guidance](https://www.sqlite.org/whentouse.html) and [WAL requirements](https://www.sqlite.org/wal.html).

## 2. VM and service specification

These are provisional sizing estimates for a small pilot, not measured capacity guarantees. Confirm expected enrolled students, simultaneous classroom scans, concurrent courses and retention before production sizing.

| Item | Proposed initial specification |
| --- | --- |
| Operating system | University-supported 64-bit Linux LTS, preferably x86-64; IT chooses its maintained distribution |
| CPU | 2 vCPU initially; no GPU required |
| Memory | 4 GB RAM for running the pilot; prefer 8 GB and 4 vCPU if building releases on this VM |
| Disk | Start with 40 GB persistent SSD-backed storage for OS, application, database and bounded logs; backup capacity separate |
| Runtime | Node.js 24 LTS, latest security-patched release at deployment, subject to migration validation |
| Process | One non-root application service, managed by systemd with automatic restart; alternatively an IT-approved OCI container |
| Web entry | University reverse proxy such as Nginx or equivalent; trusted TLS certificate and automatic renewal |
| App listener | Proposed 127.0.0.1:3000, reachable only by the reverse proxy |
| Database | SQLite file on local persistent storage; transaction-safe adapter, foreign keys, busy timeout and WAL evaluated during migration |
| Deployment | University Git/CI or restricted SSH via VPN/bastion, with documented release and rollback procedure |
| Environments | Separate staging and production databases, secrets and domains; staging uses synthetic data |

Node 24 is currently an LTS line; the exact patch version should be selected and pinned when preparing the release. [Node.js release schedule](https://nodejs.org/en/about/previous-releases).

A proposed filesystem layout is `/opt/pulse/releases/` for immutable releases, `/var/lib/pulse/` for the database and writable runtime data, and `/etc/pulse/` for tightly restricted configuration. These are proposed locations, not existing application settings. Persistent data must survive a release replacement or container restart.

No Kubernetes cluster, Redis service, GPU, Python/R runtime, commercial database licence, OpenAI API key or SMTP service is required by the current feature set. Container support is optional; no production Dockerfile or systemd unit has yet been prepared.

## 3. Networking, DNS and HTTPS

- Assign a dedicated university hostname, served at the origin root, for example `https://<approved-pulse-host>/`. The actual hostname is for IT to choose. Current routes and the PWA assume root-relative paths; hosting under a subdirectory requires additional changes.
- Inbound TCP 443 for intended students and teachers. TCP 80 is optional for HTTPS redirection or the institution's certificate process. Restrict SSH to the university administration network/VPN/bastion. Do not expose port 3000 or the database publicly.
- Confirm whether students can connect on mobile data and from off campus. A campus-only/VPN restriction changes the student experience and should be agreed explicitly.
- Runtime outbound HTTPS is needed for the approved OIDC provider's discovery, keys and token endpoints. Permit required university DNS, time synchronisation, monitoring and backup services.
- Build/maintenance systems need approved package repositories or mirrors, a source repository and any container registry used. The current source uses `next/font/google`; the migration should bundle approved fonts locally so students do not need external font requests. Build-time font retrieval must be allowed or replaced.
- The migrated production application should have no dependency on OpenAI Sites or Cloudflare for serving requests or storing student data. Verify this through network testing before acceptance.
- Preserve the original host and HTTPS scheme through the proxy, and configure the application's canonical URL explicitly. Accept client IP information only from the trusted proxy. Existing Cloudflare/platform header assumptions must be removed or adapted.
- Do not trust caller-supplied `oai-authenticated-*`, `cf-connecting-ip` or arbitrary forwarded headers as authentication. The current non-pilot authentication trusts platform identity headers and must be replaced for the VM.
- Support streaming responses; avoid shared caching of authenticated HTML, server-action responses, exports or QR redemption routes. Set suitable upload limits and timeouts with the application maintainer. Current roster UI limits CSV files to 5 MB and 2,000 students; proxy and server-action limits must be aligned and tested, since client validation alone is insufficient.
- Redact QR tokens in `/redeem/...` paths, authentication codes, cookies, roster contents and student identifiers from access/error logs. Default full-URL proxy logging would otherwise capture QR credentials.

## 4. Current application inventory

Source inspected at commit `cc0766662c297c6bb0d131e8fc73868d2ac9f25d`.

- TypeScript and React 19.2.6, with Next.js 16.2.6 declared.
- Build/runtime presently uses Vinext 1.0.0-beta.3, Vite 8.0.13 and the Cloudflare/Sites plugins. The declared start script is `vinext start`; it must not be treated as an approved university production deployment.
- Cloudflare D1 binding `DB`; application code directly imports `cloudflare:workers` in several modules and uses D1 prepared statements and batches.
- SQLite schema/migrations in `drizzle/0000_initial.sql` through `0010_permanent_onboarding_qr.sql`. Migration SQL is the source of truth; do not recreate the database solely from the ORM schema without reconciliation.
- No R2/object-storage binding is configured. Roster files are parsed in the browser and structured student records sent to the server; original uploaded files are not currently archived by the application.
- Core data: teacher accounts and course permissions, student names/numbers/emails/groups, enrolments, attendance, participation awards and corrections, nicknames, schedules, audit events and QR credentials.
- CSV/JSON exports can leave the system through authorised teacher downloads. University hosting does not prevent those downloads; IT and the course owner should agree the intended policy.
- The student PWA stores course shortcuts in the browser. Its service worker caches an offline information page, not live standings or student records.
- Public charts currently show grouped score counts without minimum group-size suppression, explicitly enabled for the synthetic-data test. Personalised student score retrieval is not implemented. Review the test settings before real-data use.

These are observed versions, not a recommendation to freeze old dependencies. The VM release needs dependency/security review, appropriate patched versions, a reproducible lockfile build and functional regression tests.

## 5. Authentication and information needed from SSO administrators

Current pilot: teachers use individual access codes; students enter a student number. That does not verify student identity. Hosting the application on a university VM does not by itself fix that limitation. Do not disable `PILOT_MODE` and assume university SSO is enabled: the other existing path is platform-specific ChatGPT authentication.

For the intended OIDC integration, please supply:

1. Issuer and discovery URL, plus access/network requirements for the provider.
2. Client registration details, client ID, supported client authentication method and any secret through the university's secure channel.
3. Available scopes and claims, especially a stable account identifier and an authoritative mapping to the roster's student number. Also identify how teachers are recognised and authorised.
4. Required MFA/session duration, logout behaviour, account deactivation and affiliation rules.
5. Test client/accounts and a test procedure for students and teachers.
6. Registration process for exact callback and logout URLs in staging and production.

The final callback paths will be supplied with the chosen OIDC implementation; none is implemented or agreed yet. The site's root URL is not the callback URL. Use Authorization Code with PKCE and validated server-managed sessions; university passwords remain with the identity provider. Course permissions and enrolment checks remain separate from authentication. [OIDC discovery specification](https://openid.net/specs/openid-connect-discovery-1_0-errata1.html).

## 6. Configuration and secrets

Current settings to account for during migration:

| Existing setting | Meaning |
| --- | --- |
| `PILOT_MODE` | Enables the unverified pilot; not an SSO configuration switch |
| `PILOT_PUBLIC_ORIGIN` | Public origin placed in generated QR links; must change to the approved university HTTPS origin |
| `PILOT_TEACHER_SECRET` | Teacher session signing secret |
| `PILOT_TEACHERS_JSON` | Teacher identities and individual access codes; treat the entire value as secret |
| `PILOT_TEACHER_CODE` | Legacy fallback teacher code; do not enable casually in production |
| `NODE_ENV` | Must be `production` for production behaviour, including secure cookies |

A database-path setting, OIDC configuration, canonical origin and new session configuration will be defined in the VM release. Names and installation commands should not be invented before that implementation. Keep secrets in the university's secret manager or a restricted service configuration file, never in Git, an image, a publicly served directory or email correspondence. Transfer existing secrets only through an approved secure channel; prefer fresh session secrets at cutover.

## 7. Backups, operations and acceptance

IT should specify the responsible teams and agreed service hours, patch process, monitoring, incident contact, retention and deletion policy. Suggested pilot targets for discussion: recover within one working day and lose no more than one day of records. If losing a teaching day's attendance is unacceptable, require a shorter backup interval/recovery point or a more suitable managed database arrangement.

Back up the complete database consistently, the deployment configuration and recoverable secrets through separate protected procedures. Use a SQLite-supported online backup or a coordinated stopped-service snapshot; copying only a live `.db` file while ignoring WAL state is not a reliable procedure. Store encrypted backups outside the VM and test restoration. [SQLite WAL documentation](https://www.sqlite.org/wal.html).

Monitor service availability, application errors, database write failures, storage utilisation, TLS expiry and backup success. A minimal readiness/liveness endpoint should be added in the VM release. Restrict OS and database access, run the app without root, and set limits on logs and writable directories. Hosting location is one part of security; institutional data-protection review and access controls still need to be completed.

Before real-data acceptance, test: teacher access boundaries; student identity mapping; unauthorised direct URLs and exports; valid/invalid/repeated QR claims; concurrent classroom check-in; course-specific nicknames; corrections and totals; chart responses containing no identifiable student records; CSV imports; restored backups; automatic service restart; and mobile/PWA installation over the final HTTPS domain. Set the load-test target from actual expected peak simultaneous scans, not total enrolment alone.

## 8. Migration and cutover

1. Agree infrastructure, domain, database choice, deployment access and SSO responsibilities.
2. Prepare the Node-compatible app, database adapter, migration runner, proxy/service definitions, configuration template, health checks and runbook. Preserve transaction and duplicate-prevention behaviour.
3. Validate a staging installation using synthetic data, including a backup/restore and concurrency test.
4. Decide explicitly whether to start with a clean test database or migrate existing records.
5. If preserving records, obtain an authorised full D1 database export, with all related tables and schema history. The application's per-course “Full backup” JSON is a reporting export, not a complete disaster-recovery dump: it omits some credentials and operational fields. Platform-managed D1 export access must be confirmed; direct Cloudflare administration access cannot be assumed. D1 supports SQL export, but access through the current hosting account needs arranging. [D1 export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
6. Freeze writes for final transfer, restore on the university service and verify record counts, foreign keys, totals, IDs and QR tokens. Keep one authoritative writable system; avoid independent writes on both hosts.
7. Update the canonical origin and QR links. Preserving a token does not change the domain embedded in an existing printed QR. Decide whether to reissue links or temporarily maintain an approved redirect from the old host. Installed PWAs and browser course shortcuts belong to the old origin; students will need to install/open the university version and re-add their courses.
8. Agree rollback before cutover. If new writes occur after migration, reconcile them before reverting. Retire or remove data from the old service only after verified transfer and explicit approval; university hosting should not silently leave an active external copy.

## 9. Decisions requested from IT

Please reply with:

- Preferred Linux version, CPU architecture and allocated VM resources.
- Proposed staging/production hostnames, TLS/proxy ownership and off-campus access policy.
- systemd versus container deployment, Git/CI or SSH process, and who will operate the application after handover.
- Approval for single-instance SQLite on persistent local disk, or the required managed database platform.
- Backup destination, retention, recovery targets, monitoring and incident/patching contacts.
- OIDC registration contact and the details listed above.
- Expected number of courses/students and peak concurrent users, if already known.
- Any mandatory security review, vulnerability scanning, data-retention or logging requirements before real student data is imported.

The VM can be provisioned while the application migration is prepared. No migration, data export or live-hosting change has been performed as part of preparing this brief.
