# Pulse Attendance

Pulse is a course attendance and participation-points application for university teaching. Teachers can manage courses and semester classes, import rosters and offline attendance, open time-limited QR check-ins, award points, and review or export records. Students use the web/PWA interface to enrol, check in, and redeem points.

## Local development

Requirements:

- Node.js 22.13 or newer
- pnpm

Install dependencies and start the development server:

```sh
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and replace the placeholder values before running a pilot environment. Never commit `.env.local` or real teacher credentials.

Useful commands:

```sh
pnpm build
pnpm lint
pnpm db:local:init
```

Database migrations are stored in `drizzle/`. Application source is under `app/`, database access code under `db/`, static PWA assets under `public/`, and regression checks under `qa/`.

## Private operational data

Course, class, roster, and attendance import files belong under `local-data/`. That directory is intentionally excluded from Git because the files may contain student identifiers or other personal information.

Generated builds, local Cloudflare state, dependencies, publishing workspaces, and historical backtracking material are also excluded. See `folderdescriptionreadme.md` for a complete project-folder inventory.

## Deployment

The current hosted application uses the configuration in `.openai/hosting.json` and a D1 database binding named `DB`. Configure production secrets in the hosting environment; do not place them in repository files.
