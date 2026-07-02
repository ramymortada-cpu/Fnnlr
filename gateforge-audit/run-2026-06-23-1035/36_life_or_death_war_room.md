# Life or Death GateForge War Room

Generated: `2026-07-02T11:41:22.213Z`

## Situation

The code-side rescue path is in place. The remaining blocker is external production-readiness evidence, not a broad product rebuild.

## Current Gate

- Decision: `CANNOT_APPROVE`
- Runtime context: `DISPOSABLE_LOCAL_STAGING_POSTGRES`
- Runtime score: `78-84/100 pending legal/provider attestation`
- Runtime checks: `13/13 PASS`
- External blockers: `7`

## Non-Negotiable Blockers

1. `hosted_staging_gateforge_run` - GitHub Actions or hosted staging artifact showing the GA unblock suite against real staging secrets.
2. `provider_webhook_replay_idempotency` - Signed provider event accepted once, duplicate handled idempotently, stale/replay event rejected.
3. `monitoring_alerting_proof` - Sentry or equivalent alert, uptime health check, cron failure alert, and webhook failure alert references.
4. `hosted_restore_drill` - Backup, restore into disposable hosted restore DB, and restore verification PASS.
5. `legal_commercial_final_approval` - Terms, Privacy, DPA, subprocessors, retention policy, and security contact final approved or signed off.
6. `admin_mfa_runtime_proof` - Hosted admin setup/verify evidence plus admin-sensitive route rejects non-MFA session.
7. `ai_budget_runtime_proof` - Allowed AI call, cap-blocked call, kill-switch blocked call, and tenant-scoped ai_usage_events evidence.

## Required External Packet

- Path: `gateforge-audit/external-attestations/hosted-staging-attestation.json`
- Template available: `gateforge-audit/external-attestations/hosted-staging-attestation.template.json`
- Template items: `7`

## Command Center

```bash
npm run typecheck
npm run gateforge:war-room
npm run gateforge:external-check
npm run gateforge:final-gate
npm run gateforge:final-report
```

## Expected Movement

- Current defensible score: `78-84/100 pending legal/provider attestation`
- With all seven external items PASS: `CONDITIONAL_GO`
- Do not claim `GO` until production/live legal, monitoring, provider, and restore evidence is complete.

See `gateforge-audit/external-attestations/HOSTED_STAGING_WAR_ROOM.md` for the operator runbook.
