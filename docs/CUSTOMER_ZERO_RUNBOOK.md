# fnnlr — Customer Zero Runbook

Running the first real customer: controlled, repeatable, supportable. Every step
maps to a runnable command. No DB hacking as a normal path; no demo data.

## The pack (commands)
```
npm run deploy:check                                   # READY_FOR_CUSTOMER_ZERO | BLOCKED
npm run customer:verify -- customer-zero.config.json   # validate config (no secrets)
npm run customer:create -- customer-zero.config.json "<ownerPassword>"   # idempotent setup
npm run customer:smoke  -- <tenantId> <funnelId>       # test-marked end-to-end smoke
npm run ops:customer    -- <tenantId> <funnelId>       # support snapshot (admin-only)
```
The config is `customer-zero.config.example.json` (copy it, fill it in). It holds
NO secrets — keys/tokens are env-only; the owner password is passed on the CLI,
never stored.

## Customer Zero checklist

### Pre-deployment
- [ ] `NODE_ENV=production` and all required env set (`modules/release/src/env-spec.ts`)
- [ ] `npm run verify:release-candidate -- --probe` → PASS
- [ ] control migrations applied (`npm run migrate:control`)
- [ ] tenant migrations apply on provision (verified by the probe)
- [ ] encryption keys present (checker confirms fail-closed)
- [ ] cron secret present
- [ ] rate limits enabled (default; in-memory — see release notes)
- [ ] jobs status known (`/health/jobs`)
- [ ] admin access verified (`/admin/tenants` returns for an owner)

### Customer setup
- [ ] `customer:create` → PASS (workspace, business, tenant, funnel created or reused)
- [ ] activation opened (Go Live) — readiness + next step shown
- [ ] page / link / payment readiness checked

### First live signal
- [ ] page published · tracked link created
- [ ] page view ingested · WhatsApp click ingested
- [ ] lead created · Revenue Desk item appears · activation progresses

### Monitoring (daily, first week)
- [ ] `/health` and `/health/db` ok
- [ ] `/health/jobs` ok
- [ ] webhook failures: `/ops/retries` (abandoned24h, dueNow)
- [ ] ops retries pending: `/ops/queues`
- [ ] audit events reviewed (`/admin/diagnostics`)
- [ ] support snapshot reviewed (`ops:customer`)

### Weekly review
- What signals arrived (snapshot `liveSignals`) · what was blocked (activation
  `blockingReason`) · what recommendations appeared · what outcomes were
  measurable · what data is still missing.

## Support playbook (first week)

**Daily checks** — health, jobs, retries, webhook failures, activation stuck
steps, Revenue Desk top item, lead count, payment states, errors24h. All visible
via `ops:customer` + `/health/*` + `/ops/*`.

**If a webhook fails**
1. Check the signature config (a configured secret means signed webhooks are
   required — fail-closed).
2. Check the integration connection status (`/admin/diagnostics` → integrations).
3. Check the stored integration_event (processed_status, error).
4. Check the audit event.
5. Safe retry: outbound retries are automatic with backoff; inbound provider
   events are idempotent on external_id (a redelivery is not double-processed).

**If activation is stuck**
1. `ops:customer` → activation stage + nextAction (the exact missing evidence).
2. Route the customer to that screen (the activation panel links each step).
3. Do NOT edit the DB manually except in a genuine emergency.

**If the customer reports an issue**
Collect: business id → activation snapshot (`/admin/activation-snapshot`) →
latest audit events + failed commands + webhook failures + scheduled runs
(`/admin/diagnostics`). Everything is read-only and secret-free.

## Rollback / disable controls (no destructive delete by default)
- **Disable all jobs globally**: `FNNLR_DISABLE_JOBS=true` → cron returns 503.
- **Pause outbound webhooks (per connection)**: set `webhook_deliveries.paused=TRUE`
  for that connection (the retry worker skips paused rows).
- **Disable an integration connection**: set its `status` to `disconnected`
  (via the integrations service `deleteConnection`, which also removes stored
  credentials).
- **Revoke a user session**: logout / delete the session row; the next request
  is unauthenticated.
- **Archive a funnel safely**: set `journeys.deleted_at` (soft delete) — data is
  retained, the funnel drops out of active views. No hard delete.
- **Remove a tenant (last resort)**: `npm run delete-tenant -- <tenantId>` closes
  the pool then drops the dedicated database. Destructive — confirm first.

## Release decision
`npm run deploy:check` prints `READY_FOR_CUSTOMER_ZERO` or `BLOCKED` with
blocking issues, warnings, manual steps, next action, and the support owner.
Blocking issues are never hidden.

---

## Repeatability (this is not a one-off)
Customer Zero is the **first-use** case of a repeatable process, not a special
case. The same flow runs customer one, two, three — see
`CUSTOMER_DEPLOYMENT_RUNBOOK.md`. Repeatability (distinct tenants, idempotent
setup, signal isolation) is proven by:
```
npm run customer:repeatability-check  -- <a.config.json> <b.config.json>
npm run customer:repeatability-report -- <a.config.json> <b.config.json>
```
`customer-one.config.example.json` is a second worked example using the **same
schema** as `customer-zero.config.example.json`.
