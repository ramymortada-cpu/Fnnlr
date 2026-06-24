# GateForge GA Unblock Status

Generated: `2026-06-24T16:23:57.315Z`

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
| GitHub Actions secret names | `FAIL` | required GitHub secret names are missing |
| Hosted strict workflow | `UNKNOWN` | no GateForge Hosted Staging Strict run found |
| GA evidence workflow | `PASS` | 28111216039 completed/success f8f409bc2604cbad77a70fbbd634d29d15ce2f5b (https://github.com/ramymortada-cpu/Fnnlr/actions/runs/28111216039) |

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

## Score Translation

- `65-70/100`: local controls improved, but local/staging evidence is incomplete.
- `70-74/100`: local evidence ready, GitHub Actions secrets still not uploaded.
- `74-78/100`: hosted secrets ready, hosted strict run still not passing.
- `78-84/100`: hosted strict evidence passed; final gate and human attestations decide Conditional GO.

## Safety Guarantees

- Secret values printed: `NO`
- Production mutated: `NO`
- Source fixes applied by this command: `NO`
