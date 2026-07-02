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
- SaaS moat execution board: `npm run moat:plan` then `npm run moat:check`.

## SaaS moat execution evidence
- `SAAS_MOAT_ACTION_PLAN.md` — 165-point execution board.
- `SAAS_MOAT_ACTION_PLAN.csv` — machine-readable action board.
- `SAAS_MOAT_OWNER_QUEUE.md` — owner-sorted queue for the current non-code/doc-ready moat actions.
- `SAAS_MOAT_OWNER_QUEUE.csv` and `.json` — machine-readable owner queue generated from the execution status.
- `TRUST_CENTER_INDEX.md` — buyer-safe proof index.
- `PRICING_AND_LIMITS_MATRIX.md` — packaging and enforcement plan.
- `USAGE_LIMIT_ENFORCEMENT_MAP.md` — plan-limit enforcement backlog.
- `ACTIVATION_METRICS_SPEC.md` — activation measurement plan.
- `ACTIVATION_COHORT_REVIEW.md` — cohort review template.
- `WORKFLOW_INTELLIGENCE_SPEC.md` — AI/workflow data moat plan.
- `LEGAL_APPROVAL_TRACKER.md` and `SUBPROCESSORS.md` — legal/compliance execution trackers.
- `gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.md` — exact closeout checklist for the 16 remaining externally blocked GA evidence items plus the 5 terminal dependency gates.
- `gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.json` — machine-readable owner/action/secret/evidence/validation map for the same 16 blockers, with separate dependency gate metadata for the full 21-item open P0 path.
- `gateforge-audit/run-2026-06-23-1035/49_external_blocker_progress.md` — current per-blocker progress board across local secrets, GitHub secret names, and hosted evidence.
- `gateforge-audit/run-2026-06-23-1035/49_external_blocker_progress.json` — machine-readable status counts for `LOCAL_SECRET_PENDING`, `GITHUB_SECRET_PENDING`, and `HOSTED_EVIDENCE_PENDING`.
- `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.md` — operator-ready command path, provider setup, and validation matrix for closing the 16 external provider/runtime blockers before the 5 dependency gates can close.
- `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.csv` and `.json` — machine-readable operator execution packet with secret names only.
- `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.md` and `.json` — ordered dependency chain for `GF-017`, `GF-018`, `GF-019`, `GF-021`, and `GF-022`.
- `gateforge-audit/run-2026-06-23-1035/54_hosted_readiness_contract.md` and `.json` — current gate contract proving local evidence cannot approve GA without hosted proof.
- `gateforge-audit/run-2026-06-23-1035/55_open_p0_terminal_runbook.md` and `.json` — terminal 21-item open P0 runbook combining the 16 external blockers and 5 dependency gates.
- `gateforge-audit/run-2026-06-23-1035/56_hosted_strict_trigger_readiness.md` and `.json` — readiness proof for triggering hosted strict validation once secrets and attestation exist.
- `gateforge-audit/run-2026-06-23-1035/60_hosted_secret_acceptance_matrix.md` and `.json` — secret-name-only acceptance matrix for hosted runtime and attestation readiness.

## Readiness Contract Index

These contracts keep sales, proof, activation, and enterprise claims evidence-gated.
`HOSTED_PROOF_PENDING` and `HUMAN_ATTESTATION_REQUIRED` remain honest gaps, not
passes.

| Area | Contract | Test | Current claim posture |
| --- | --- | --- | --- |
| GTM proof | `modules/proof/src/gtm-readiness.ts` | `tests/gtm-proof-readiness.test.ts` | Partner/case-study public claims require hosted proof and customer approval |
| Pilot offer | `modules/sales-ops/src/pilot-offer-readiness.ts` | `tests/pilot-offer-readiness.test.ts` | Pilot is contract-ready; repeatability requires hosted pilot evidence |
| ICP outreach | `modules/sales-ops/src/outreach-readiness.ts` | `tests/outreach-readiness.test.ts` | Outreach requires compliance review and hosted tracking evidence |
| Industry templates | `modules/activation/src/industry-template-readiness.ts` | `tests/industry-template-readiness.test.ts` | Template docs are ready; promotion/repeatability requires hosted cohort evidence |
| Template performance | `modules/activation/src/template-performance.ts` | `tests/template-performance.test.ts` | Template loop remains hosted-gap-labeled until real cohort proof exists |
| Operating cadence | `modules/operating-room/src/readiness.ts` | `tests/operating-cadence-readiness.test.ts` | Customer health/support cadence remains hosted-gap-labeled |
| Commercial limits | `modules/commercial/src/enforcement-readiness.ts` | `tests/commercial-enforcement-readiness.test.ts` | Limit source is contract-ready; route-level proof remains explicit |
| Enterprise readiness | `modules/enterprise/src/readiness.ts` | `tests/enterprise-readiness.test.ts` | Enterprise posture is limited/roadmap until evidence closes |
| Trust center | `modules/proof/src/trust-center-readiness.ts` | `tests/trust-center-readiness.test.ts` | Buyer trust packet is shareable only when proof links and gap labels are present |
| Evidence index | `modules/proof/src/evidence-index-readiness.ts` | `tests/evidence-index-readiness.test.ts` | This index must expose the active readiness contracts |

## What is NOT claimed
No guaranteed revenue. No auto-send. No payment processing. No unconditional
enterprise-readiness. No market traction is claimed — there is no real customer
data in this pack, and none is fabricated.
