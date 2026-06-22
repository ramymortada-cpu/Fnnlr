# HANDOFF — fnnlr Platform Foundation (for Codex / the coding agent)

This repository is a **runnable, tested foundation** for fnnlr: total
database-per-tenant isolation + a production-grade WhatsApp-aware automation
engine + API + scheduler + visual builder. Read this file first, then extend
per the strategy documents.

---

## What this repo IS

A working backbone you build the rest of fnnlr on. It already implements the two
hardest, can't-retrofit-later pieces correctly:

1. **Total tenant isolation** — every individual seller and every agency gets its
   own **physical PostgreSQL database**. Cross-tenant access is impossible at the
   infrastructure layer (different DB, different role, different password). Proven
   by tests.
2. **A revenue automation engine** stronger than HighLevel/ManyChat/Zapier on the
   axes that matter in Arab WhatsApp commerce: WhatsApp cost-window awareness,
   anti-spam/no-zann safety, human approval gates, durable waits, DB-level
   idempotency — all running inside each tenant's isolated DB.

## Status: tested and green
`npm install && npm test` → **24 tests, 22 pass, 2 skip** (the 2 skipped are
live-DB integration tests that run when you point them at a real Postgres).
`npx tsc --noEmit` → clean.

---

## Architecture (one screen)

```
CONTROL-PLANE DB (shared)            TENANT DBs (one per seller/agency, isolated)
  tenants, routing, users      ──►     businesses, leads, conversations,
  benchmark_aggregates (anon)          payments, events, automations,
                                       automation_runs, step_logs, approvals
        │ resolveTenant()
        ▼
  Router (packages/db/src/router.ts) ── withTenant(tenantId, fn) ──► correct DB

Automation flow:
  event ─► service.ingestEvent() ─► AutomationEngine.onEvent()
        ─► run created (idempotent) ─► steps execute / park on wait/approval
        ─► Scheduler resumes due waits ─► WhatsApp guard (free/paid/wait/skip)
        ─► paid send ⇒ approval ⇒ human approves ⇒ engine.onApproved()
```

## Map of the code

| Area | Path | Status |
|---|---|---|
| Connection router (isolation core) | `packages/db/src/router.ts` | ✅ done, tested |
| Control-plane schema | `packages/db/control-plane/migrations/` | ✅ |
| Tenant schema (+ automation tables) | `packages/db/tenant/migrations/` | ✅ |
| Provision / delete a tenant DB | `modules/provisioning/src/provision.ts` | ✅ |
| Automation engine | `modules/automation/src/engine.ts` | ✅ tested |
| Conditions evaluator (safe) | `modules/automation/src/conditions.ts` | ✅ |
| WhatsApp economics guard | `modules/automation/src/guards/whatsapp.ts` | ✅ tested |
| Safety guard (anti-spam/approval) | `modules/automation/src/guards/safety.ts` | ✅ tested |
| Action dispatcher | `modules/automation/src/dispatcher.ts` | ✅ |
| DB-backed RunStore | `modules/automation/src/store.ts` | ✅ |
| DB-backed ActionPorts | `modules/automation/src/ports.ts` | ✅ |
| Automation service (CRUD + ingest) | `modules/automation/src/service.ts` | ✅ |
| Scheduler (durable waits) | `modules/automation/src/scheduler.ts` | ✅ tested |
| Synthetic triggers (stalled/no-reply) | `modules/automation/src/synthetic.ts` | ✅ |
| WhatsApp Cloud API sender | `modules/channels/src/whatsapp.ts` | ✅ (needs BSP creds) |
| HTTP API | `apps/api/src/server.ts` | ✅ tested |
| Visual builder UI (RTL Arabic) | `apps/automation-builder/index.html` | ✅ |
| Built-in recipes | `modules/automation/src/recipes.ts` | ✅ |

## Run it

```bash
npm install
cp .env.example .env          # set CONTROL_PLANE_DATABASE_URL + TENANT_DB_ADMIN_URL
npm run migrate:control       # control-plane schema
npm run provision -- --type=individual --name="Test Seller"   # makes a dedicated DB
npm run migrate:all           # apply tenant migrations across all tenant DBs
npm run api                   # HTTP API on :8787
npm run scheduler             # durable wait/loop scheduler
open apps/automation-builder/index.html   # design automations (save to the API)
npm test                      # 24 tests
```

## API endpoints (all require `x-tenant-id` except /health)

```
GET    /health
GET    /automations
POST   /automations                 { name, triggerEvent, conditions[], actions[], ... }
PATCH  /automations/:id
POST   /automations/:id/enable
POST   /automations/:id/disable
DELETE /automations/:id
POST   /events                      { event:{type,payload}, entity:{type,id}, lead?, ... }
GET    /approvals
POST   /approvals/:id/approve
POST   /approvals/:id/reject
```

---

## What remains (your work, Codex) — in priority order

These are wiring/extension tasks; the hard architecture is done.

1. **Auth + tenant resolution from sessions.** Today the API trusts an
   `x-tenant-id` header. Replace with: control-plane `tenant_users` login →
   session → derive tenant id server-side. Never trust the header in prod.
   *Files:* `apps/api/src/server.ts`, new `modules/auth`.

2. **WhatsApp BSP credentials + phone storage.** `modules/channels/src/whatsapp.ts`
   is complete but needs (a) a BSP/Meta token + phone_number_id per tenant
   (store encrypted, like tenant DB creds), and (b) a `phone` column on `leads`
   (add a tenant migration `0003_lead_contact.sql`). Wire `makeChannelSenders`
   into `run-scheduler.ts` and the API in place of the no-op senders.

3. **Inbound WhatsApp webhook.** Add `POST /webhooks/whatsapp` that verifies the
   signature, normalizes inbound messages into `messages` + `events`
   (`message.received`), and calls `openServiceWindow()` to refresh the free
   window. This closes the loop so `getWindowState()` returns real data.

4. **Capture module (BP5 from the plan).** Tracked click-to-WhatsApp redirect +
   page snippet ingest → `lead.captured` / `page.event`. The events already
   drive automations; just emit them.

5. **Remaining Build Packs** from `Execution Blueprint` / `Build Packs` docs:
   system-of-record UI, Leak Board + Leak Brain, owner dashboard, Data Vault
   screens. The event spine + isolation they depend on already exist.

6. **Scheduler hardening for scale.** Current scheduler iterates tenants
   sequentially. For many tenants: shard by tenant, add row-level locking
   (`SELECT ... FOR UPDATE SKIP LOCKED`) on due runs, and run multiple workers.

## Rules to preserve (do not violate)

- **Never** add a code path that reaches tenant data without `withTenant()`.
- **Never** let an automation send a paid WhatsApp message without approval.
- **Never** put raw tenant data in `benchmark_aggregates` — anonymized only.
- **Always** keep sends idempotent (idempotencyKey) and waits durable.
- **Always** apply new tenant tables via a numbered migration in
  `packages/db/tenant/migrations/` AND run `migrate:all`.

## Tests to keep green

- `tests/isolation*.test.ts` — tenant isolation (the company-ending risk).
- `tests/automation.test.ts` — engine behaviors incl. WhatsApp economics.
- `tests/scheduler.test.ts` — durable wait resume.
- `tests/api.test.ts` — routing + tenant-header enforcement.

Add a test with every new module. Isolation and approval tests must never regress.
