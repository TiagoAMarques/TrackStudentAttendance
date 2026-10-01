# Pulse university server deployment

This deployment target runs on ordinary Node.js with a local SQLite database. It does not use Cloudflare Workers or D1 at runtime.

## Current security boundary

Use the access-code pilot only in a staging environment with synthetic data. `PILOT_MODE=true` is not SSO and must not be used for real student data. `AUTH_PROVIDER=sites` is valid only on OpenAI Sites and must never be enabled on the university VM. The university release supports OIDC Authorization Code flow with PKCE, state and nonce validation, server-side login transactions, opaque database-backed sessions, and authoritative roster linking.

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

For university OIDC, set `PILOT_MODE=false`, keep unverified students disabled, and replace the disabled provider with:

```dotenv
AUTH_PROVIDER=oidc
PULSE_PUBLIC_ORIGIN=https://pulse.campus.ciencias.ulisboa.pt
OIDC_ISSUER_URL=<issuer supplied by the University>
OIDC_CLIENT_ID=<client ID>
OIDC_CLIENT_SECRET=<secret supplied through a secure channel>
OIDC_CLIENT_AUTH_METHOD=client_secret_basic
OIDC_SCOPES=openid profile email
OIDC_REDIRECT_URI=https://pulse.campus.ciencias.ulisboa.pt/api/auth/callback/oidc
OIDC_POST_LOGOUT_REDIRECT_URI=https://pulse.campus.ciencias.ulisboa.pt/
OIDC_STUDENT_ID_CLAIM=<authoritative institutional ID-number claim>
OIDC_TEACHER_GROUP_CLAIM=<group or role claim; dotted paths supported>
OIDC_TEACHER_GROUPS=<comma-separated groups granted teacher access>
AUTH_SESSION_SECRET=<at least 32 random characters>
```

The redirect and post-logout URLs must exactly match the identity-provider registration. If no teacher groups are configured, OIDC users are students unless their stable generated user ID already has an explicit course-teacher assignment. The configured student ID claim is matched only against imported roster ID numbers; names and email addresses are never used to establish student ownership. Restart with `pm2 restart ecosystem.config.cjs --update-env` after configuration changes.

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

## Remaining production acceptance

Before real student data is used, validate discovery and token exchange against the university provider, the authoritative student-ID claim, teacher group mapping, test student/teacher accounts, logout, session expiry, proxy HTTPS headers, and rejected unauthorized access. Successful implementation does not replace the university's security and data-protection acceptance.
