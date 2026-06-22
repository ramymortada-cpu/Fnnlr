# fnnlr — Sprint 35 Report (Scheduler & Ingestion Scaling)

Sprint 32 proved idempotency on real Postgres; Sprint 34 closed the security surface. Sprint 35 makes the operating layer ready for many tenants, funnels, and events without data corruption, duplicate runs, or collapse under webhook flood. A simple, evolvable scaling layer — not a queue platform. No new product features.

**Result: 367 tests. Without a DB, 347 pass and 20 skip with an explicit reason. On real Postgres, all 20 DB-dependent tests pass (367/367 effective). Typecheck clean.**

## 1. Migration 0029 — the scaling schema

Added in one scope-bound migration: `parent_run_id` + lease columns (`heartbeat_at`, `lease_expires_at`) on `scheduled_runs`; a `scheduled_run_batches` parent table (unique on job_type+idempotency_key); outbound retry columns on `webhook_deliveries` (`max_attempts`, `next_retry_at`, `last_attempt_at`, `idempotency_key`, `paused`); event-dedup unique indexes on `integration_events(connection_id, external_id)`, `page_events(page_id, event_key)`, and `conversation_messages(conversation_id, external_id)`; plus high-volume read indexes on leads, payment_states, and the retry queue. Verified to apply cleanly on a freshly-provisioned tenant.

## 2. Scheduled job fan-out (`modules/scheduler/src/fanout.ts`)

`fanOutBusinesses` and `fanOutTenants` run a per-target job across many targets in **bounded batches** (default 25) with a **concurrency cap** (default 5). A failure in one target is recorded and skipped over — never fatal to the rest. The parent `scheduled_run_batches` row summarises succeeded/failed/skipped and is marked `completed_with_errors` when any target failed. No unbounded "run everything at once". Proven live: a fan-out where one business throws still completes the others and records `failed=1`.

## 3. Job lease / locking (`modules/scheduler/src/lease.ts`)

Built on the existing `scheduled_runs` unique key plus a lease window. `acquireLease` returns the run to execute, or refuses when an equivalent run is already in flight. A stuck run (lease expired) is safely reclaimed and retried. `heartbeat` extends the lease while work proceeds; `completeLease`/`failLease` close it. Proven live: **two concurrent acquisitions of the same job produce exactly one run**, and **a run with an expired lease is reclaimed** and reused.

## 4. Event-processing idempotency

Every incoming event is now idempotent at the DB level:
- **Payment webhooks** — `INSERT … ON CONFLICT (connection_id, external_id) DO NOTHING`; a duplicate provider event is stored once and **not re-processed** (the handler returns `duplicate: true` and skips enrichment). Proven live.
- **WhatsApp messages** — deduped on `(conversation_id, external_id)`; a redelivered message doesn't double-insert.
- **Page events** — an optional client `event_key` dedupes on `(page_id, event_key)`.

## 5. Ingestion backpressure

Building on Sprint 34's payload limits: per-IP rate limits on `/track/page-event(s)`, `/r/:code`, and the webhooks; oversized batches rejected with 413; a global job kill-switch (`FNNLR_DISABLE_JOBS=true` → cron returns 503). A webhook flood logs failures and can be rejected with 429, but never corrupts state or stops tenant processing.

## 6. Outbound webhook retry / backoff (`modules/realtime/src/outbound.ts`)

A failed dispatch is now recorded as `retrying` with `next_retry_at` and an exponential backoff (30s → 1m → 2m → … capped at 1h). `processOutboundRetries(tenantId, batchSize)` picks due deliveries, re-sends, and either marks `delivered`, schedules the next backoff, or **abandons** after `max_attempts`. A paused connection is skipped. Failure never breaks the domain flow. Proven live: a delivery at attempt max-1 is **abandoned** on the next failure; backoff caps at 1h.

## 7. Tracking event batching

`POST /track/page-events` accepts an array, validates each event against the allow-list, rejects oversized batches (>500 → 413), and returns `{ accepted, rejected, duplicates }` for partial success. Tenant is resolved from the page/link code, never a header.

## 8. Ops observability (`modules/scheduler/src/ops.ts`)

Read-only, admin-only summaries: `/ops/status` (run counts + durations + stuck runs), `/ops/retries` (deliveries by status, due-now, abandoned-24h), `/ops/ingestion` (events/errors/page-events/unmatched last hour), `/ops/queues` (running jobs, retrying deliveries). Not a dashboard — just enough to answer "are jobs running, are retries piling up, is ingestion flowing?". Gated to `owner`/`admin`.

## 9. Admin safety controls

Global job kill-switch (`FNNLR_DISABLE_JOBS`), per-connection outbound pause (`webhook_deliveries.paused`), bounded fan-out (batch size + concurrency caps), and the existing rate limits. Config-based, no new infra.

## 10. Scripts

`jobs:daily`, `jobs:weekly`, `jobs:outbound-retries` added; cron exposes `fanout-daily`, `fanout-weekly`, `outbound-retries` (worker-ready, no external worker required yet). Cross-tenant fan-out jobs need no tenantId (they iterate active tenants safely); per-tenant jobs still take the tenant from the signed body, never a header.

## Tests
- `tests/scaling.test.ts` (4): backoff growth + cap, batch validation (non-array + oversized), ops header-only rejection, global kill-switch 503.
- Live-DB scaling tests (6 of the 18-test live suite): concurrent-lease dedup, stuck-run reclaim, fan-out failure isolation, duplicate-payment dedup, outbound retry→abandon, ops counts.
- All prior suites (security, revenue-desk, live-db isolation/transactions/constraints) still green.

## Acceptance — all met
Scheduled fan-out ✓ · duplicate concurrent jobs prevented ✓ · stuck jobs retryable ✓ · ingestion backpressure ✓ · event processing idempotent ✓ · outbound retries/backoff ✓ · batch tracking endpoint ✓ · high-volume indexes reviewed/added ✓ · ops status ✓ · one-tenant failure doesn't stop the rest ✓ · tests green ✓ · live DB tests green (20/20) ✓ · no new features ✓ · no queue overbuild ✓.

## Remaining risks (honest)
- Fan-out runs in-process. It's worker-ready (pure functions, idempotent leases), but a true multi-worker deployment should drive `fanOutTenants` from an external scheduler hitting `/internal/cron/fanout-daily` per shard. Documented, not yet sharded.
- The lease uses a time-based window, not a DB advisory lock. Under heavy contention on a single hot job the reclaim race is resolved by the conditional UPDATE (only one winner), but a Postgres advisory lock would be stricter; revisit if a job's body becomes long-running.
- Outbound retries are pulled by a cron worker; there's no real-time backpressure signal to the dispatcher yet. Fine at current volume.
- `event_key` for page events is opt-in (the hosted snippet must supply it); without it, page events are not deduped (acceptable — they're low-stakes and high-volume).

## Status
The audit-driven hardening arc (S31 data integrity → S32 live plane → S33 coherence → S34 security → S35 scaling) is complete. fnnlr now: records before it advises, runs on a validated live plane, presents one coherent operating surface, resists abuse, and absorbs scale without corruption or duplicate runs. Natural next directions: a pilot onboarding pass, or deeper Revenue Leak Intelligence on the now-trustworthy observed data.
