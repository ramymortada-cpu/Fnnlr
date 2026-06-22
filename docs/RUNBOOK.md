# fnnlr — Deployment Runbook (Release Candidate)

Every step here maps to a runnable command. Run them in order on a fresh
environment. Nothing in this runbook uses demo data or fabricates readiness.

## 0. Prerequisites
- Node 22+, a managed PostgreSQL (the admin role needs `CREATEDB` + `CREATEROLE`
  so each tenant gets a dedicated database — that is the isolation boundary).

## 1. Set the environment
Required in production (the release checker FAILS if any are missing):

```
export NODE_ENV=production
export CONTROL_PLANE_DATABASE_URL="postgresql://user:pass@host:5432/fnnlr_control"
export TENANT_DB_ADMIN_URL="postgresql://admin:pass@host:5432/postgres"
export TENANT_DB_HOST=host
export TENANT_CREDENTIAL_ENCRYPTION_KEY="<32+ byte secret>"
export INTEGRATION_ENCRYPTION_KEY="<32+ byte secret>"
export FNNLR_CRON_SECRET="<random secret>"
```

Optional: `ANTHROPIC_API_KEY` (AI runs in degraded fallback without it),
`API_PORT` (default 8787), `FNNLR_DISABLE_JOBS=true` (kill-switch).
**Never set `FNNLR_DEV_MODE=true` in production** — the checker flags it as a
blocking failure (it would let the API trust a client `x-tenant-id` header).

The full classification (required / optional / dev-only / fail-closed behavior)
is the single source of truth in `modules/release/src/env-spec.ts`.

## 2. Migrate the control plane
```
npm run migrate:control
```

## 3. Run the release-candidate checker
```
npm run verify:release-candidate          # env + DB + migrations + fail-closed
npm run verify:release-candidate -- --probe  # also does a disposable provisioning test
```
Exits non-zero on any blocking issue. A PASS means: required env present, control
DB reachable, encryption fails closed, no dev tenant trust, cron secret set.

## 4. Verify production safety
```
npm run verify:production-safety   # encryption fail-closed, webhook + auth security
```

## 5. Run the live database tests (against the managed Postgres)
```
npm run test:pg                    # tenant isolation, constraints, transactions, idempotency
```
(Use `docker-compose.test.yml` for a local Postgres if needed.)

## 6. Create the first customer (real empty records, no demo data)
```
npm run create:customer -- owner@business.com "<password>" "<Business Name>"
```
This creates: user → dedicated tenant DB → workspace → owner membership →
business → first funnel, and prints the activation stage + next step. The owner
then opens **Go Live / تفعيل البيزنس** to continue.

## 7. Start the API
```
npm run api
```

## 8. Health checks (after start)
```
curl localhost:8787/health            # ok | degraded | failed (no secrets)
curl localhost:8787/health/db
curl localhost:8787/health/jobs
curl localhost:8787/health/integrations
```

## 9. Schedule the jobs (external scheduler hitting the cron endpoints)
```
POST /internal/cron/fanout-daily     (header: x-cron-secret: $FNNLR_CRON_SECRET)
POST /internal/cron/fanout-weekly
POST /internal/cron/outbound-retries  (body: { tenantId })
```

## 10. Support / triage (admin only)
```
GET /admin/tenants                 # list tenants
GET /admin/workspaces
GET /admin/diagnostics             # current tenant: counts + latest failures
GET /admin/activation-snapshot     # current tenant primary funnel
GET /admin/tenant-health
GET /ops/status | /ops/retries | /ops/ingestion | /ops/queues
```

## Recovery notes
- **Migration failure**: the runner is idempotent (`IF NOT EXISTS`); re-run
  `migrate:control` / provisioning. A partially-applied tenant DB can be dropped
  via `npm run delete-tenant -- <tenantId>` and re-provisioned.
- **Encryption key missing in production**: credential storage fails closed
  (throws) — set the key, restart. No plaintext is ever written.
- **Cron secret missing**: cron endpoints return 401 — jobs simply don't run;
  nothing is exposed. Set `FNNLR_CRON_SECRET` and retry.
- **Stuck scheduled run**: the lease expires and the next run reclaims it; no
  manual intervention needed.
