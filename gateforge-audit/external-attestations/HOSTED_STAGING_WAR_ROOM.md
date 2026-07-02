# Hosted Staging War Room

Generated: `2026-07-02T19:49:55.669Z`

Purpose: close the remaining GateForge external evidence blockers without weakening the gate.

## Current Decision

- Decision: `CANNOT_APPROVE`
- Runtime context: `DISPOSABLE_LOCAL_STAGING_POSTGRES`
- Runtime score: `78-84/100 pending legal/provider attestation`
- Runtime checks: `13/13 PASS`
- External packet: `MISSING`
- External contract: `FAIL` - External packet does not satisfy the strict evidence contract.

## Emergency Rule

Do not mark an item `PASS` unless it has a safe evidence reference. Missing evidence remains `MISSING`; legal signoff remains `HUMAN_ATTESTATION_REQUIRED` until final approval exists.

## Evidence Checklist

| Evidence item | Current status | Owner | Acceptance evidence | Score lift |
| --- | --- | --- | --- | --- |
| `hosted_staging_gateforge_run` | `ABSENT` | Engineering/operator | GitHub Actions or hosted staging artifact showing the GA unblock suite against real staging secrets. | `+1 to +2` |
| `provider_webhook_replay_idempotency` | `ABSENT` | Engineering/operator | Signed provider event accepted once, duplicate handled idempotently, stale/replay event rejected. | `+1 to +2` |
| `monitoring_alerting_proof` | `ABSENT` | Engineering/operator | Sentry or equivalent alert, uptime health check, cron failure alert, and webhook failure alert references. | `+1 to +2` |
| `hosted_restore_drill` | `ABSENT` | Engineering/operator | Backup, restore into disposable hosted restore DB, and restore verification PASS. | `+2 to +3` |
| `email_deliverability_runtime_proof` | `ABSENT` | Engineering/operator | Transactional provider test plus SPF, DKIM, and DMARC verified sender evidence. | `+1 to +2` |
| `legal_commercial_final_approval` | `ABSENT` | Founder/legal | Terms, Privacy, DPA, subprocessors, retention policy, and security contact final approved or signed off. | `+1 to +2` |
| `admin_mfa_runtime_proof` | `ABSENT` | Engineering/operator | Hosted admin setup/verify evidence plus admin-sensitive route rejects non-MFA session. | `+1 to +2` |
| `ai_budget_runtime_proof` | `ABSENT` | Engineering/operator | Allowed AI call, cap-blocked call, kill-switch blocked call, and tenant-scoped ai_usage_events evidence. | `+1 to +2` |

## Exact Execution Order

1. Copy the template to the live packet path:

```bash
cp gateforge-audit/external-attestations/hosted-staging-attestation.template.json gateforge-audit/external-attestations/hosted-staging-attestation.json
```

2. Run the hosted staging suite with real staging secrets and keep only sanitized artifact links:

```bash
GATEFORGE_EVIDENCE_CONTEXT=HOSTED_STAGING npm run gateforge:ga-unblock
npm run ci:live
npm run test:pg
npm run deploy:health-gate
npm run deploy:smoke
npm run deploy:verify-restore
```

3. Prove restore, monitoring, admin MFA, AI budget controls, and webhook replay/idempotency using hosted artifacts or safe screenshots.

4. Replace each `MISSING` or `HUMAN_ATTESTATION_REQUIRED` status in `gateforge-audit/external-attestations/hosted-staging-attestation.json` with `PASS` only when the evidence reference exists.

5. Run the strict validators:

```bash
npm run gateforge:external-check
npm run gateforge:final-gate
npm run gateforge:final-report
```

## Final Gate

The target is `CONDITIONAL_GO`. The final gate must still fail closed until all eight external items are `PASS`.
