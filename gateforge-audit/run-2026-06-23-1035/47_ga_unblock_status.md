# GateForge GA Unblock Status

Generated: `2026-07-02T10:40:58.532Z`

This status file is the single operator dashboard for the GA unblock path. It contains secret names and readiness states only; no secret values are printed.

## Decision

- Gate state: `CANNOT_APPROVE_LOCAL_EVIDENCE`
- Defensible score band: `65-70/100`
- Next action: Replace local runtime secrets and create a valid hosted staging attestation packet, then run npm run gateforge:hosted-readiness-doctor.
- Rationale: Code controls are materially stronger, but GA evidence is still local/incomplete.

## Probe Summary

| Probe | Status | Detail |
| --- | --- | --- |
| Local secret values | `FAIL` | runtime 6/17, attestation 0/1; open runtime 11 |
| Attestation secret pack | `FAIL` | attestation packet is blocked until real hosted evidence exists |
| Remaining external blocker closeout | `PASS` | 16 BLOCKED_EXTERNAL items mapped in 48_remaining_external_blocker_closeout.json |
| External blocker progress | `PASS` | 16 local, 0 GitHub-stage, 0 hosted evidence pending; 11 GitHub names missing |
| Operator execution packet | `PASS` | 16 blockers mapped with 19 hosted secret file options |
| GitHub Actions secret names | `FAIL` | required GitHub secret names are missing |
| Hosted strict workflow | `UNKNOWN` | no GateForge Hosted Staging Strict run found |
| GA evidence workflow | `PASS` | 28583636877 completed/success 8e3ea389877e96bdfb98bee18c1f311a26cd26b0 (https://github.com/ramymortada-cpu/Fnnlr/actions/runs/28583636877) |

## Open Runtime Secret Names

- `CONTROL_PLANE_DATABASE_URL`
- `TENANT_DB_ADMIN_URL`
- `TENANT_DB_HOST`
- `SENTRY_DSN`
- `UPTIME_HEALTHCHECK_URL`
- `ALERT_EMAIL_TO`
- `ALERT_WEBHOOK_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `ANTHROPIC_API_KEY`

## Open Attestation Requirement

- `GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON`
- `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`

## Remaining External Blocker IDs

- `GF-001`
- `GF-002`
- `GF-003`
- `GF-004`
- `GF-005`
- `GF-006`
- `GF-007`
- `GF-008`
- `GF-009`
- `GF-010`
- `GF-011`
- `GF-012`
- `GF-013`
- `GF-014`
- `GF-015`
- `GF-016`

## Remaining External Blocker Progress

- Local secret pending: `16`
- GitHub secret pending: `0`
- Hosted/provider evidence pending: `0`
- Unique local secret names not ready: `11`
- Unique GitHub secret names missing: `11`
- Source: `gateforge-audit/run-2026-06-23-1035/49_external_blocker_progress.json`
- Operator packet: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

## Evidence Scope

- Local secret directory mode: `default-local-dir`
- Local secret directory: `/tmp/fnnlr-gateforge-secrets`
- GitHub secret source: `live-github`
- Local secret readiness is GA evidence: `NO`
- Hosted strict workflow required for GA: `YES`

## Score Translation

- `65-70/100`: local controls improved, but local/staging evidence is incomplete.
- `70-74/100`: local evidence ready, GitHub Actions secrets still not uploaded.
- `74-78/100`: hosted secrets ready, hosted strict run still not passing.
- `78-84/100`: hosted strict evidence passed; final gate and human attestations decide Conditional GO.

## Safety Guarantees

- Secret values printed: `NO`
- Production mutated: `NO`
- Source fixes applied by this command: `NO`
