# fnnlr — Deployment Runbook (managed Postgres)

Goal: a fresh managed-like DB goes from empty → ready with no manual DB hacking.
Every step is a real command.

## 1. Provision databases
- Create the control database (e.g. `fnnlr_control`) on managed Postgres.
- Ensure the admin role can CREATE databases and roles (for per-tenant DBs).

## 2. Apply control migrations
```
npm run migrate:control
```

## 3. Provision the first tenant + tenant migrations
```
npm run customer:create -- customer-zero.config.json "<ownerPassword>"
```
(The provisioning path creates the tenant DB and applies tenant migrations.)

## 4. Verify
```
npm run test:pg                      # live DB suite (needs the DB reachable)
npm run verify:release-candidate     # PASS / FAIL, no secrets
npm run deploy:health-gate           # READY_TO_SERVE | DEGRADED | BLOCKED
npm run deploy:smoke                 # server + safe-route probes
```

## 5. Customer-zero acceptance
```
npm run customer:execution-lock -- customer-zero.execution.json <tenantId> <funnelId>
npm run customer:go-live        -- customer-zero.execution.json <tenantId> <funnelId>
```

## Release gate (one command)
```
npm run ci         # typecheck + tests + commercial checker + safety + web/security
npm run ci:live    # same, plus live DB tests when CONTROL_PLANE_DATABASE_URL is set
```
`ci` prints `SAFE TO RELEASE` or `NOT SAFE TO RELEASE`.

## Rules
- No manual DB hacking as a normal path.
- Do not claim production-ready without `ci` and a restore test (see BACKUP_RESTORE_RUNBOOK).
