# fnnlr — Security & Trust Proof

Security posture with the evidence behind each control. fnnlr is evidence-based,
requires human approval, does not auto-send, and does not process payments.

## Tenant isolation
Database-per-tenant via `withTenant` — a different pool is a different physical
database. Proof: `tests/isolation.test.ts`, live `REPEATABILITY` (signal isolation
between two customers).

## No x-tenant-id trust
In production the API never trusts a client `x-tenant-id` header; tenant is
resolved server-side. Dev trust is opt-in only via `FNNLR_DEV_MODE`. Proof:
`SECURITY: x-tenant-id header does NOT grant access`, `spoofed x-tenant-id grants
nothing in production`.

## Encrypted credentials
Tenant DB credentials and integration secrets are encrypted at rest
(`TENANT_CREDENTIAL_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`).

## Production fail-closed encryption
In production, storing a secret without the key throws — no plaintext fallback.
Proof: `PRODUCTION + missing key → storing a secret throws`, `P0 when encryption
does not fail closed in production`.

## Webhook fail-closed
A connection with a configured secret rejects a missing/wrong signature. Proof:
live `SECURITY: webhook with a configured secret rejects a missing/wrong
signature`.

## Rate limiting
Request body limits (413) and per-route protections in `apps/api/src/server.ts`.

## Command apply protections
Mutating/destructive actions require explicit human approval; the run resumes only
after approval. Proof: `destructive/data-changing intents require approval`,
`approval flow resumes the run after human approves`, `every mutating
recommendation requires approval`.

## No auto-send
fnnlr drafts WhatsApp messages; a human sends. A paid send auto-requires approval.
Proof: `paid WhatsApp send auto-requires approval`.

## No payment processing
fnnlr records manual payment state; it does not move money. Unknown payment
providers are rejected. Proof: `unknown payment provider is rejected`.

## Audit logs
Security/operational events are recorded in `audit_events` (commands, repairs,
execution, launch, issues) with safe detail — no secrets, no customer-facing stack
traces.

## Rollback safety
The default rollback is non-destructive and preserves all databases; it never
drops a tenant DB. A restore-from-backup is included only with explicit
confirmation. Proof: `tests/deployment.test.ts` (`the rollback plan never drops a
tenant database`).

## Live DB proof
The above security behaviors that touch the database are exercised against a real
Postgres via `npm run test:pg`.

## Remaining risks
- Production CI must run `test:pg`; the embedded test DB is not a managed instance.
- Rate-limit and incident thresholds are defaults pending real telemetry.
- The consistency/proof checkers are heuristic; human review of new copy is still
  advised.
- No real customer data is present; no traction is claimed and none is fabricated.
