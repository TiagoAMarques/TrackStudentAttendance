# Project folder guide

This document describes the items at the root of the Pulse attendance project. It is an inventory and cleanup guide; it does not mean that every item is required in production.

## Status key

- **Essential** — source, configuration, migrations, or tests that should remain with the project.
- **Active support** — current documentation, data, or deliverables used around the application.
- **Generated** — recreated by installing, building, or running the application; normally not committed or deployed as source.
- **Historical** — retained for audit, backtracking, or reference, but not used by the running application.
- **Temporary** — working material that can normally be removed after its immediate task is complete.
- **Local/private** — machine-specific configuration or data that must not be published.

## Root folders

| Folder | Status | Purpose and contents | Cleanup guidance |
|---|---|---|---|
| `.git/` | Essential | Git repository metadata, history, branches, and internal object database. | Do not edit or delete manually. |
| `.next/` | Generated | Next.js-generated type/build metadata. At present it mainly contains generated types. | Safe to regenerate; excluded by `.gitignore`. |
| `.openai/` | Essential | Sites hosting configuration, including the hosted project identifier and database binding. | Keep while this project is deployed with Sites. Do not confuse it with build output under `dist/.openai`. |
| `.pnpm-store/` | Generated | Local pnpm package cache. | Reproducible from `pnpm-lock.yaml`; excluded by `.gitignore`. |
| `.sites-publish/` | Temporary | A separate deployment checkout assembled for the latest Sites publication. It contains copied source, generated output, a deployment archive, and its own Git metadata. It is not the canonical source tree. | Excluded by `.gitignore`. Keep only while deployment recovery/comparison is useful; it can be removed after confirming the live release and canonical source are safe. |
| `.vinext/` | Generated | Vinext development/build cache and generated font assets. | Recreated by the toolchain; excluded by `.gitignore`. |
| `.wrangler/` | Generated / local | Wrangler state, including local development/deployment metadata and possibly a local D1 database. | Excluded by `.gitignore`. Regenerable, but preserve it if its local database contains test data you care about. |
| `app/` | Essential | Main application source: pages, dashboards, teacher and student flows, server actions, authentication, course management, QR attendance, manual attendance import, exports, styles, and supporting components. | Canonical product code; keep. |
| `archive/` | Historical | Deliberately isolated backtracking material under `archive/backtracking`, including older deployment snapshots, QA artifacts, legacy presentation material, and assessments. | Not production and excluded by `.gitignore`. Its placement intentionally marks it as local history rather than repository content. |
| `db/` | Essential | TypeScript database access, schema declarations, and environment typings for D1. | Keep with the application source. |
| `dist/` | Generated | Current compiled deployment output: client assets, server bundle, and hosting metadata. | Recreated by the build; excluded by `.gitignore`. Needed as an output for publishing, not as editable source. |
| `drizzle/` | Essential | Ordered SQL database migrations. These preserve the production schema history and add features over time. | Keep all migrations, including older ones; they are not disposable legacy files. |
| `local-data/` | Local/private | Operational input data kept outside the application source. It is divided into `attendance-imports/`, `class-imports/`, `course-imports/`, and `rosters/`. | The entire folder is excluded by `.gitignore`. Do not publish it; back it up only in an appropriately protected location. |
| `node_modules/` | Generated | Installed JavaScript dependencies and executable tools. This is by far the largest folder. | Recreated from `package.json` and `pnpm-lock.yaml`; should not be committed or deployed as project source. |
| `ops/` | Essential support | Operational database checks; currently contains the identity-integrity preflight SQL. | Keep as an operations/runbook asset. |
| `outputs/` | Generated / staging | Generated assessments, schema snapshots, build bundles, migration-generation artifacts, and upload staging. It now includes `github-browser-upload/batch-1-core` and `batch-2-tests-and-docs`, the privacy-screened sets prepared for GitHub's browser uploader. | Excluded by `.gitignore` and never canonical source. The GitHub batches are disposable copies; regenerate them from the root project whenever source changes before upload. Older historical outputs could later move beneath `archive/backtracking`. |
| `presentation/` | Active support | Current Quarto stakeholder guide: editable `.qmd` source, slide styling, and rendered HTML presentation. | Keep as the canonical presentation deliverable. |
| `public/` | Essential | Static web assets: icons, favicon, PWA manifest, offline page, and student service worker. | Deployed with the application; keep. |
| `qa/` | Essential | Automated regression, security, database, import, distribution, and dependency assessment tests and helper scripts. | Keep active tests. Some one-off helper scripts may eventually be archived, but the folder as a whole is current and useful. |
| `RGPD_AIPD_DPIA/` | Active support / sensitive | University privacy-impact-assessment reference workbook. It is governance evidence rather than runtime code. | Keep if required for governance. Review access before sharing because compliance documents may contain sensitive information. |

## Root files

### Configuration and project definition

| File | Status | Purpose |
|---|---|---|
| `.env.example` | Essential | Safe template showing required environment variables. Values should be examples, not secrets. |
| `.env.local` | Local/private | Machine-specific runtime configuration and credentials. Never publish or commit it. |
| `.gitignore` | Essential | Prevents dependencies, local configuration, private rosters, generated builds, and caches from entering Git. |
| `.Rhistory` | Generated / local | Empty R-session history file created automatically by an R-based rendering or editing session. | Excluded by `.gitignore`; not application source and safe to remove when no R session needs it. |
| `drizzle.config.ts` | Essential | Drizzle migration/schema configuration. |
| `eslint.config.mjs` | Essential | JavaScript/TypeScript linting rules. |
| `next-env.d.ts` | Generated support | Framework-generated TypeScript declarations. It is expected locally but ignored by Git. |
| `next.config.ts` | Essential | Next.js compatibility/build configuration. |
| `package.json` | Essential | Project scripts, dependencies, and package metadata. |
| `pnpm-lock.yaml` | Essential | Exact dependency versions for repeatable installs. |
| `pnpm-workspace.yaml` | Essential | pnpm workspace and dependency-build policy. |
| `README.md` | Essential support | Main GitHub-facing project introduction, local setup instructions, privacy boundary, and deployment overview. |
| `tsconfig.json` | Essential | TypeScript compiler configuration. |
| `tsconfig.tsbuildinfo` | Generated | TypeScript incremental compilation cache. Safe to regenerate and not a production asset. |
| `vite.config.ts` | Essential | Vinext/Vite build and development configuration. |
| `wrangler.local.jsonc` | Local support | Wrangler configuration for local Cloudflare-compatible development. |
| `folderdescriptionreadme.md` | Active support | This editable inventory of root folders, root files, and cleanup status. |
| `folderdescriptionreadme.html` | Generated support | Rendered HTML copy of this guide. It may lag behind the Markdown source; the Markdown file is authoritative. |

### Operational and stakeholder documentation

| File | Status | Purpose |
|---|---|---|
| `HANDOVER_SSO_AND_LIVE_PILOT.md` | Active support | Handover notes for SSO and live-pilot operation. |
| `Identity_Integrity_Handover.md` | Active support | Design and operational notes about student identity integrity. |
| `Pulse_Pre_Migration_Assessment.md` | Active support / historical | Written assessment produced before migration. Useful as decision history, not runtime material. |
| `Pulse_Migration_Assessment.zip` | Historical | Packaged migration-assessment deliverable. The ZIP is a reference artifact, not application input. |
| `Pulse_University_VM_Hosting_Brief.md` | Active support | Hosting brief for a university-managed virtual machine. |
| `STUDENT_ERROR_REFERENCE.md` | Active support | Reference for student-facing errors and support responses. |
| `Teacher_Access_Guide.md` | Active support | Teacher access and usage guidance. |

### Data and reference assets

| File | Status | Purpose and caution |
|---|---|---|
| `Pulse.png` | Active support | Pulse branding image used as a reusable presentation/document asset. It is not part of the web app's `public` assets. |

The operational input files are now organized below `local-data/` rather than stored in the project root:

| Location | Contents |
|---|---|
| `local-data/attendance-imports/` | `attendanceENTP1.2a.csv` and `EN2026-events.csv` attendance import/export files. |
| `local-data/class-imports/` | `ClassesEN2026.xlsx`, the semester-class/timetable import workbook. |
| `local-data/course-imports/` | `Courses.xlsx`, the course import/reference workbook. |
| `local-data/rosters/` | EN2026 and check-in-test participant CSVs. These may contain student identifiers and personal information. |

## GitHub browser-upload staging

`outputs/github-browser-upload/` contains copies prepared for a first upload through GitHub's web interface:

| Location | Contents |
|---|---|
| `batch-1-core/` | Core application, database code and migrations, public assets, configuration, and package metadata. |
| `batch-2-tests-and-docs/` | QA files, the repository README, project guides, stakeholder presentation, and supporting documentation. |
| `update-2026-09-23-class-attendance/` | Five replacement source files for adding the per-class attendance table and class-specific CSV export to an existing GitHub repository. See `outputs/github-browser-upload/UPDATE-2026-09-23.md` for the upload manifest and deployment record. |

These batches intentionally omit `.env.local`, `local-data/`, dependency folders, build output, deployment workspaces, historical archives, privacy workbooks, and redundant packaged ZIP files. Upload the **contents** of each batch, not the outer batch directory. Because they are snapshots, they must be refreshed after later source changes.

## Audit conclusion

There are no unexplained application-source folders: `app`, `db`, `drizzle`, `public`, `qa`, `ops`, and the project configuration form a coherent active codebase.

Not everything at the root is required for production:

1. `.sites-publish/` is a temporary publication checkout left by the latest deployment workflow.
2. `outputs/` contains older generated and historical deliverables and is not canonical source.
3. `archive/` intentionally contains material kept only for backtracking.
4. `.next/`, `.pnpm-store/`, `.vinext/`, `.wrangler/`, `dist/`, `node_modules/`, and `tsconfig.tsbuildinfo` are generated or local state, although `.wrangler/` may hold useful local test data.
5. Operational CSV/XLSX inputs are isolated under the ignored `local-data/` folder and should not be included in a public deployment package.
6. `.Rhistory` is an automatically generated local session file and is ignored.
7. `outputs/github-browser-upload/` is a disposable, privacy-screened upload snapshot rather than another source tree.

The safest future tidy-up would be to remove `.sites-publish/` after deployment verification and move any still-needed material from `outputs/` into the existing backtracking archive. The private import files have already been organized under `local-data/`; no data files were deleted.
