# Pulse university server deployment

This deployment target runs on ordinary Node.js with a local SQLite database. It does not use Cloudflare Workers or D1 at runtime.

## Current security boundary

Use this release only in a staging environment with synthetic data until university OIDC is implemented and accepted. `PILOT_MODE=true` retains the access-code and unverified student pilot; it is not SSO and must not be used for real student data. `AUTH_PROVIDER=sites` is valid only on OpenAI Sites and must never be enabled on the university VM.

## Required configuration

Keep configuration outside Git in a service-owned environment file with mode `0600`:

```dotenv
NODE_ENV=production
PULSE_DATABASE_PATH=/var/lib/pulse/pulse.sqlite
PILOT_PUBLIC_ORIGIN=https://pulse.campus.ciencias.ulisboa.pt
PILOT_MODE=true
PILOT_ALLOW_UNVERIFIED_STUDENTS=false
PILOT_TEACHER_SECRET=<long random value>
PILOT_TEACHERS_JSON=<staging accounts only>
AUTH_PROVIDER=disabled
```

The database must be on persistent local storage, not an NFS/SMB share. The service account needs write access to its directory. Back up the database using a SQLite-aware online backup or a coordinated stopped-service snapshot that includes WAL state.

## Build and migrate

Use the lockfile and the approved Node 22.13+ or Node 24 LTS runtime:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run release:university
PULSE_DATABASE_PATH=/var/lib/pulse/pulse.sqlite corepack pnpm run db:university:migrate
```

The migration command is transactional and records applied files in `_pulse_migrations`. Run it before starting each new release. Test backup restoration before using real data.

## PM2

Load the restricted environment file using the university's service-management procedure, then run:

```sh
pm2 start ecosystem.config.cjs
pm2 save
```

The process listens only on `127.0.0.1:3000`. The reverse proxy should be the only network client able to reach it.

## Reverse proxy and monitoring

- Proxy `https://pulse.campus.ciencias.ulisboa.pt/` to `http://127.0.0.1:3000/` and preserve the original host and HTTPS scheme.
- Do not cache authenticated HTML, server-action responses, exports, or redemption routes.
- Strip caller-supplied `oai-authenticated-*`, `cf-connecting-ip`, and untrusted forwarded identity headers.
- Redact QR tokens, access codes, cookies, roster contents, and ID numbers from logs.
- Check `GET /api/health`; HTTP 200 with `{"status":"ok"}` confirms both the application and database are ready.
- Do not expose port 3000 or the SQLite file publicly.

## Remaining production gate

University OIDC/SAML integration requires the issuer/discovery URL, client registration, claims, role mapping, test accounts, and approved callback/logout URLs. Until that is implemented, forged-header rejection and student/teacher/admin authorization cannot receive production acceptance.
