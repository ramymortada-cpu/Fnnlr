# fnnlr — Evidence Index

Every important claim, mapped to its evidence. This is the source of truth behind
the proof pack. Confidence is honest; limitations are explicit. fnnlr is
evidence-based, requires human approval, does not auto-send WhatsApp, does not
process payments, and makes no guaranteed-revenue claim.

| Claim | Evidence type | Files / modules | Tests | Live DB proof | Limitation | Confidence |
|---|---|---|---|---|---|---|
| Tenant isolation works (database-per-tenant) | live DB + unit | `packages/db/src/router.ts` (`withTenant`, `getTenantPool`, `resolveTenant`) | `tests/isolation.test.ts`; live `REPEATABILITY`, `SECURITY` blocks | yes — distinct tenant DBs, no cross-tenant access | production CI must run `test:pg` | high |
| No `x-tenant-id` trust in production | unit | `apps/api/src/server.ts` | `SECURITY: x-tenant-id header does NOT grant access`; `spoofed x-tenant-id grants nothing in production` | n/a (HTTP-level) | dev opt-in only via `FNNLR_DEV_MODE` | high |
| Credentials encrypted, fail-closed in production | unit | `packages/db/src/router.ts`, `modules/integrations` | `PRODUCTION + missing key → storing a secret throws`; `P0 when encryption does not fail closed` | n/a | keys must be set in prod (release checker enforces) | high |
| Webhook fail-closed on bad signature | live DB | `modules/integrations`, `modules/realtime` | live `SECURITY: webhook with a configured secret rejects a missing/wrong signature` | yes | per-connection secret resolved server-side | high |
| No fake revenue | unit + rule | `modules/recommendations`, `modules/attribution`, `modules/operating-room`, `modules/execution` | live `72h monitor invents no revenue`; `week1 invents no revenue`; `whatsapp first reply captured as progression, not revenue` | yes | revenue known only when `payment_states.amount` exists | high |
| No auto-send WhatsApp | rule + unit | `modules/whatsapp`, `modules/command` | `paid WhatsApp send auto-requires approval`; sales-ops `auto-send expectation → bad_fit` | n/a | drafts only; a human sends | high |
| Human approval for mutating actions | unit | `modules/command`, `modules/repairs`, `modules/recommendations` | `every mutating recommendation requires approval`; `destructive/data-changing intents require approval`; `approval flow resumes after human approves` | n/a | — | high |
| Customer setup is repeatable | live DB | `modules/repeatability/src/runner.ts`, `modules/customer-zero/src/setup.ts` | `tests/repeatability.test.ts`; live `REPEATABILITY` | yes — two customers, distinct tenants, signal-isolated | unique customer identifiers required | high |
| Activation / go-live / operating room | live DB | `modules/activation`, `modules/execution`, `modules/operating-room` | live `EXECUTION LOCK`, `GO-LIVE`, `OPERATING ROOM` | yes | launch only on READY/WARN, never BLOCKED | high |
| Production deployment readiness | unit + scripts | `modules/deployment`, `scripts/{deploy,backup-restore,ci}.ts` | `tests/deployment.test.ts` | partial — guards proven; managed-PG drill pending in target env | run `ci` + a real restore drill before go-live | medium |
| Commercial claims are consistent (no over-promise) | unit | `modules/commercial/src/consistency.ts`, `modules/proof/src/checker.ts` | `tests/commercial.test.ts`, `tests/proof.test.ts` | n/a | heuristic; human review still advised | high |
| Scheduler / ingestion scaling | unit + live | `modules/scheduler` | `tests/scaling.test.ts`; live `SCALE: fan-out continues after one business fails` | yes (failure isolation) | thresholds are defaults, tune with telemetry | medium |

## How to regenerate the proofs
- Unit: `npm test` (or `npm run ci`).
- Live DB: `npm run test:pg` against a real Postgres.
- Commercial/proof consistency: `npm run commercial:check` / `npm run proof:check`.
- Deployment: `npm run deploy:health-gate`, `npm run deploy:smoke`, `npm run ci`.

## What is NOT claimed
No guaranteed revenue. No auto-send. No payment processing. No unconditional
enterprise-readiness. No market traction is claimed — there is no real customer
data in this pack, and none is fabricated.
