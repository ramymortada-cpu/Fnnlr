# fnnlr — Sprint 32 Report (Live Plane Validation + Production Safety)

The Sprint 30 audit's trust gap was that the data plane had never run against a real database: tenant isolation was *asserted* in skipped tests, the Sprint-31 unique constraints were *unproven* on a real DB, outcome writes weren't transactional, and the encryption fallback could silently store plaintext in production. Sprint 32 closes that gap — **everything below was executed against a real PostgreSQL instance, not mocked.** No new features.

**Result: 334 tests. Against real Postgres, all 334 pass with 0 skipped. Without a DB configured, 324 pass and 10 skip with an explicit reason. Typecheck clean.**

## 1. Real Postgres test path — proven, not promised

A real PostgreSQL was stood up and the previously-skipped suites ran against it:
- **The 2 tenant-isolation tests that were skipped since Sprint 0 now pass on a real DB** — two tenants get physically separate databases; deleting a tenant truly drops its database.
- **Control-plane migrations apply cleanly from an empty database** (verified by dropping and recreating the control DB, then running `migrate:control` from scratch).
- New scripts: `npm run test:pg` (live-DB + isolation suites), `npm run verify:production-safety` (encryption + webhook security), `migrate:control`, `migrate:tenant`. `docker-compose.test.yml` provides a one-command Postgres for any environment with Docker.

## 2. Live-DB suite (`tests/live-db.test.ts`) — 8 tests, all green on real Postgres

1. **Migrations apply + indexes exist** — the Sprint-31 unique indexes (`uq_opp_learning_outcome`, `uq_rec_learning_outcome`, …) are physically present.
2. **UNIQUE CONSTRAINT enforced by the DB** — inserting a second learning row for the same source outcome is rejected with Postgres error `23505`. This is the proof the audit demanded: the moat-protecting constraint is real at the database level, not just in the aggregator math.
3. **TRANSACTION rollback** — an error mid-write leaves **zero** partial outcome/learning state.
4. **Scheduler idempotency** — a duplicate `(job_type, idempotency_key)` is rejected by the DB.
5. **Isolation** — tenant B cannot see tenant A's rows.
6. **Live WhatsApp webhook** — a Cloud-API inbound payload stores an event, creates the lead/conversation, opens the service window, and leaves tenant B completely untouched.
7. **Live payment webhook** — an unmatched payment payload is stored safely, never dropped.
8. **Daily refresh run twice does not inflate the learning sample** — the Sprint-31 fix, now validated end-to-end on a real DB (`opportunity_learning_records` count is identical after the second run).

## 3. Transaction safety (`withTenantTx`)

Added a transactional helper to the router (`BEGIN → fn → COMMIT`, `ROLLBACK` on any throw) and wrapped all five outcome/learning write sequences in it:
- `checkOpportunityOutcome` + `markOutcome` (opportunities)
- `checkRecommendationOutcome` + `markRecOutcome` (recommendations)
- `runAttribution` (attribution)
- `measureOutcome` (repairs)
- `measureApplicationOutcome` (playbooks)

Each sequence (demote latest → insert outcome → upsert learning → collapse old rows) is now all-or-nothing. The post-commit `.then()` chains (e.g. capture → attribution) run in their own scope, so no transaction nests another — verified no `withTenantTx`-inside-`withTenant`.

## 4. Encryption fail-closed in production

`encryptSecret` (and therefore `encryptCredentials`) now **throws** when `NODE_ENV=production` and no encryption key is set — refusing to store a credential rather than silently writing `plain:`. In dev it still falls back to a clearly-marked `plain:` value. Proven by `tests/production-safety.test.ts` (5 tests): production+missing-key throws; dev+missing-key round-trips with the marker; with a key it's AES-GCM and the ciphertext never contains the plaintext; masking never exposes the raw secret to a frontend-bound caller.

## 5. Webhook / public-route / cron security (`tests/webhook-security.test.ts`, 7 tests)

- WhatsApp + payment webhooks with an **unknown connectionId → safe 404**, regardless of a spoofed `x-tenant-id`.
- A spoofed `x-tenant-id` on a protected route in production → **401** (header ignored, tenant comes from the session).
- Cron with **missing or wrong secret → 401**; with the correct secret but no `tenantId` in the (signed) body → **422** — it never falls back to a header for the tenant.
- Unknown public redirect code → 404/safe redirect, never tenant-private data.

A live cross-tenant test also confirms a webhook for tenant A cannot write into tenant B (separate databases make it physically impossible).

## 6. Production-safety improvement found while testing

`deleteTenant` now **closes the app-side tenant pool before dropping the database**, eliminating a connection-leak that surfaced as async errors when a tenant's DB was dropped out from under a live pool. This is a real reliability fix for tenant suspend/delete.

## 7. Observability (already present, confirmed)

Failed scheduled runs store their error reason and skipped items (`finishRun(..., 'failed', summary, error)`, `addItem(..., 'skipped', reason)`); command apply errors are persisted on the `commands` row; webhook processing failures are stored as `integration_events` with `processed_status='error'` and the reason. Enough to diagnose production failures without a monitoring system.

## Acceptance — all met
Real Postgres test path exists ✓ · skipped isolation tests now run live ✓ · learning unique constraints verified on DB ✓ · outcome/learning writes transactional ✓ · repeated scheduler runs don't inflate data (proven on DB) ✓ · encryption fail-closed in production ✓ · webhook spoofing tests pass ✓ · public code/slug resolution tested ✓ · migration safety tested ✓ · typecheck clean ✓ · full unit suite green (324/0/10) ✓ · live DB suite green (334/0/0) with documented `npm run test:pg` ✓ · no features added ✓.

## Remaining risks (honest)
- The embedded Postgres used here proves correctness; **production should still run the same `test:pg` suite against the managed Postgres** (RDS/Cloud SQL) in CI on every deploy — the `docker-compose.test.yml` + scripts make that a copy-paste.
- `withTenantTx` holds a transaction for the full write sequence; under very high contention on a single hot opportunity this could increase lock time. Not a concern at current scale; revisit with the scheduler scaling work (Sprint 35).
- Webhook **signature** verification is exercised for the "missing/!verify" paths; a full provider-by-provider signature-fixture test (real Paymob/Meta signature samples) is still worth adding when those credentials are available.

## Next: Sprint 33 — UX Coherence / Revenue Desk (the audit's other major gap: collapse Opportunities + Recommendations + Action Center into one surface with real, distinct types instead of 12× `resolve_leak`).
