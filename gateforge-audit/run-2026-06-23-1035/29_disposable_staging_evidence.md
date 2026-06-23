# Disposable Staging Evidence Run

Generated from the June 23, 2026 rescue execution.

## Purpose

Break the previous evidence ceiling caused by missing staging variables by creating a disposable local PostgreSQL staging-like environment and running the live database gates against a real server.

## Infrastructure

- Container: `fnnlr-gateforge-postgres`
- Image: `postgres:16-alpine`
- Host port: `55433`
- Control DB: `fnnlr_control`
- Tenant DB prefix: `fnnlr_gateforge_tenant`
- Scope: local disposable evidence only; not production and not hosted staging.

Secret values were not written to this report.

## Commands Proven

| Command | Result | Evidence |
|---|---|---|
| `npm run migrate:control` | PASS | control-plane migrations `0001` through `0005` applied. |
| `npm run test:pg` | PASS | 28 live DB tests passed; 0 skipped; 0 failed. |
| `npm run ci:live` | PASS | `SAFE TO RELEASE` with live DB tests enabled. |
| `npm run deploy:health-gate` | PASS | `READY_TO_SERVE` with disposable env configured. |
| `npm run deploy:verify-restore -- control ...` | PASS | control restore table verification probe passed. |

## Evidence Meaning

This closes the previous local `BLOCKED_BY_ENVIRONMENT` status for:

- tenant physical database isolation
- control-plane connectivity
- tenant provisioning/deletion
- live DB migration execution
- live CI execution
- local runtime health gate wiring
- restore verification logic

## Remaining Non-Local Requirements

- hosted staging evidence artifact
- real provider webhook replay/idempotency evidence
- real monitoring/alerting proof
- legal/commercial final approval
- production backup/restore drill on disposable hosted restore DB

## Gate Interpretation

Score estimate moves to `78-84/100 pending legal/provider attestation`.

Gate remains `CANNOT_APPROVE` for full GA until the remaining non-local requirements are archived.
