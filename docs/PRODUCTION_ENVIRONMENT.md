# fnnlr — Production Environment

The single source of truth for env vars is `ENV_SPEC` (in code); `.env.production.example`
is generated from it via `npm run deploy:env-template` so the list never drifts.
**Never commit real secrets.**

## Required in production (release checker FAILS if missing)
- `NODE_ENV=production` — gates the fail-closed paths.
- `CONTROL_PLANE_DATABASE_URL` — control-plane Postgres (tenants, auth, sessions).
- `TENANT_DB_ADMIN_URL` — admin connection to CREATE per-tenant DBs/roles.
- `TENANT_DB_HOST` — host for per-tenant connection strings.
- `TENANT_CREDENTIAL_ENCRYPTION_KEY` — AES key for tenant DB credentials (fail-closed).
- `INTEGRATION_ENCRYPTION_KEY` — AES key for integration secrets (fail-closed).
- `FNNLR_CRON_SECRET` — required on `/internal/cron/*` (endpoints 401 without it).

## Deployment-level URLs
- `APP_BASE_URL`, `API_BASE_URL` — public base URLs for customer-facing links.

## Optional
- `ANTHROPIC_API_KEY` — enables real LLM; without it, AI runs degraded (marked).
- `API_PORT` (default 8787), `TENANT_DB_PORT` (default 5432), `TENANT_DB_PREFIX`,
  `SCHEDULER_INTERVAL_MS`, `FNNLR_DISABLE_JOBS` (kill-switch).

## Dev-only (MUST be unset in production)
- `FNNLR_DEV_MODE` — allows `x-tenant-id` header trust for local testing only. The
  release checker FAILS if it is `true` in production.

## Verify
```
npm run deploy:env-template          # regenerate the example (no secrets)
npm run verify:release-candidate     # full env + DB + migrations + fail-closed checks
npm run deploy:health-gate           # READY_TO_SERVE | DEGRADED | BLOCKED
```
