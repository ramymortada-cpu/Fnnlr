# Open P0 Terminal Runbook

Generated: `2026-07-02T20:29:05.875Z`

Decision: `PASS`

This runbook is the terminal operator bridge for the remaining GateForge P0 work. It combines the 16 external provider/runtime blockers with the 5 hosted-secret dependency gates. It contains secret names and commands only, never secret values.

## Current Gate

- Gate state: `CANNOT_APPROVE_LOCAL_EVIDENCE`
- Score band: `65-70/100`
- Doctor decision: `REPLACE_LOCAL_SECRET_PLACEHOLDERS`
- Next command: `npm run gateforge:secret-replacement-packet, then replace the listed local secret values and rerun npm run gateforge:hosted-readiness-doctor.`

## Counts

- Total moat actions: `165`
- Evidence-file present: `144`
- Open P0: `21`
- External blockers: `16`
- Dependency gates: `5`

## Command Order

| Order | Command |
| ---: | --- |
| 1 | `npm run gateforge:local-secrets-env-template` |
| 2 | `npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all` |
| 3 | `npm run gateforge:local-secret-files-check` |
| 4 | `npm run gateforge:hosted-readiness-doctor` |
| 5 | `npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation` |
| 6 | `npm run gateforge:hosted-unblock -- --apply --prepare-attestation` |
| 7 | `npm run gateforge:trigger-hosted-strict` |
| 8 | `npm run gateforge:final-gate` |
| 9 | `npm run gateforge:final-report` |

## Open P0 Matrix

| Order | ID | State | Action | Command |
| ---: | --- | --- | --- | --- |
| 1 | `GF-001` | `BLOCKED_EXTERNAL` | Provision hosted staging control-plane Postgres. | `npm run gateforge:operator-execution-packet` |
| 2 | `GF-002` | `BLOCKED_EXTERNAL` | Provision tenant database admin access for staging. | `npm run gateforge:operator-execution-packet` |
| 3 | `GF-003` | `BLOCKED_EXTERNAL` | Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions. | `npm run gateforge:operator-execution-packet` |
| 4 | `GF-004` | `BLOCKED_EXTERNAL` | Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions. | `npm run gateforge:operator-execution-packet` |
| 5 | `GF-005` | `BLOCKED_EXTERNAL` | Set TENANT_DB_HOST in the local secret pack and GitHub Actions. | `npm run gateforge:operator-execution-packet` |
| 6 | `GF-006` | `BLOCKED_EXTERNAL` | Create staging Sentry or equivalent error-monitoring project. | `npm run gateforge:operator-execution-packet` |
| 7 | `GF-007` | `BLOCKED_EXTERNAL` | Set SENTRY_DSN for staging. | `npm run gateforge:operator-execution-packet` |
| 8 | `GF-008` | `BLOCKED_EXTERNAL` | Create uptime monitor for /health. | `npm run gateforge:operator-execution-packet` |
| 9 | `GF-009` | `BLOCKED_EXTERNAL` | Set UPTIME_HEALTHCHECK_URL. | `npm run gateforge:operator-execution-packet` |
| 10 | `GF-010` | `BLOCKED_EXTERNAL` | Set ALERT_EMAIL_TO for staging operations. | `npm run gateforge:operator-execution-packet` |
| 11 | `GF-011` | `BLOCKED_EXTERNAL` | Set ALERT_WEBHOOK_URL for staging alerts. | `npm run gateforge:operator-execution-packet` |
| 12 | `GF-012` | `BLOCKED_EXTERNAL` | Create Resend staging key or approved transactional email provider key. | `npm run gateforge:operator-execution-packet` |
| 13 | `GF-013` | `BLOCKED_EXTERNAL` | Set RESEND_API_KEY. | `npm run gateforge:operator-execution-packet` |
| 14 | `GF-014` | `BLOCKED_EXTERNAL` | Verify sender domain and set EMAIL_FROM. | `npm run gateforge:operator-execution-packet` |
| 15 | `GF-015` | `BLOCKED_EXTERNAL` | Set EMAIL_REPLY_TO. | `npm run gateforge:operator-execution-packet` |
| 16 | `GF-016` | `BLOCKED_EXTERNAL` | Create capped Anthropic staging key. | `npm run gateforge:operator-execution-packet` |
| 17 | `GF-017` | `BLOCKED_BY_SECRET_READINESS` | Run local secret replacement packet after operator values exist. | `npm run gateforge:secret-replacement-packet` |
| 18 | `GF-018` | `BLOCKED_BY_HOSTED_ATTESTATION` | Generate hosted staging attestation packet from real evidence only. | `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` |
| 19 | `GF-019` | `BLOCKED_BY_HOSTED_ATTESTATION` | Encode validated attestation as the preferred B64 secret. | `npm run gateforge:attestation-secret-pack -- --write-b64` |
| 20 | `GF-021` | `BLOCKED_BY_SECRET_READINESS` | Upload local secret pack to GitHub Actions after validation. | `npm run gateforge:hosted-unblock -- --apply --prepare-attestation` |
| 21 | `GF-022` | `BLOCKED_BY_GITHUB_SECRET_READINESS` | Trigger GateForge Hosted Staging Strict. | `npm run gateforge:trigger-hosted-strict` |

## Validation Results

| Check | Status | Evidence |
| --- | --- | --- |
| `MOAT-TOTAL` | `PASS` | The moat board still tracks 165 actions. |
| `OPEN-P0-SCOPE` | `PASS` | Open P0 scope is exactly GF-001..GF-016 plus GF-017, GF-018, GF-019, GF-021, GF-022. |
| `OPEN-P0-STATE-COUNTS` | `PASS` | Open state counts match the current 144/21 split. |
| `OPERATOR-PACKET-COVERS-EXTERNAL` | `PASS` | Operator packet covers all 16 external blockers at LOCAL_SECRET_PENDING. |
| `EXTERNAL-ROWS-COMPLETE` | `PASS` | Every external blocker has secrets, validation commands, evidence requirements, and next action. |
| `DEPENDENCY-CHAIN-COVERS-GATES` | `PASS` | Dependency chain covers the five remaining hosted-secret gates. |
| `READINESS-CONTRACT-HONEST` | `PASS` | Readiness contract confirms local-only approval is not allowed. |
| `SOURCE-SAFETY` | `PASS` | Source artifacts confirm no secrets printed, no production mutation, and no source dumps. |
| `RUNBOOK-COVERS-21-P0` | `PASS` | Terminal runbook has one ordered row for every open P0 blocker. |

## Details

### 1. GF-001 - Provision hosted staging control-plane Postgres.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Provider database identifier and sanitized successful hosted health gate output.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 2. GF-002 - Provision tenant database admin access for staging.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Hosted tenant provision/delete test output and sanitized DB-per-tenant proof.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 3. GF-003 - Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Local secret files check PASS and GitHub secret name present.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 4. GF-004 - Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Hosted strict live DB tests PASS.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 5. GF-005 - Set TENANT_DB_HOST in the local secret pack and GitHub Actions.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Local secret files check READY and hosted tenant routing proof.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 6. GF-006 - Create staging Sentry or equivalent error-monitoring project.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Sanitized project reference and alert proof attached to hosted attestation.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 7. GF-007 - Set SENTRY_DSN for staging.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Hosted strict monitoring item PASS.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 8. GF-008 - Create uptime monitor for /health.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Monitor URL, screenshot/log reference, and successful health gate.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 9. GF-009 - Set UPTIME_HEALTHCHECK_URL.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- GateForge secret check READY and hosted attestation item PASS.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 10. GF-010 - Set ALERT_EMAIL_TO for staging operations.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Alert delivery proof in hosted evidence packet.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 11. GF-011 - Set ALERT_WEBHOOK_URL for staging alerts.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Cron/webhook failure alert proof.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 12. GF-012 - Create Resend staging key or approved transactional email provider key.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Provider test send and DNS posture evidence.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 13. GF-013 - Set RESEND_API_KEY.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Hosted strict email readiness evidence.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 14. GF-014 - Verify sender domain and set EMAIL_FROM.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- SPF/DKIM/DMARC evidence and provider verified sender.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 15. GF-015 - Set EMAIL_REPLY_TO.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Transactional provider config proof.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 16. GF-016 - Create capped Anthropic staging key.

State: `BLOCKED_EXTERNAL`

Command:

```bash
npm run gateforge:operator-execution-packet
```

Evidence required:
- Provider-side cap proof and AI gateway hosted smoke evidence.

Unblock evidence: Real provider/staging evidence listed in 50_operator_execution_packet.md.

Source: `gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json`

### 17. GF-017 - Run local secret replacement packet after operator values exist.

State: `BLOCKED_BY_SECRET_READINESS`

Command:

```bash
npm run gateforge:secret-replacement-packet
```

Evidence required:
- 45_secret_replacement_packet.md lists every runtime and attestation secret without values.
- Local secret files check reports every runtime secret READY and at least one attestation option READY.

Unblock evidence: All runtime secret files and one attestation option are READY without printing values.

Source: `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.json`

### 18. GF-018 - Generate hosted staging attestation packet from real evidence only.

State: `BLOCKED_BY_HOSTED_ATTESTATION`

Command:

```bash
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
```

Evidence required:
- hosted-staging-attestation.json validates with external-check.
- Attestation references live hosted evidence for DB, observability, email, AI cap, and smoke checks.

Unblock evidence: Hosted staging attestation packet exists, is sanitized, and validates.

Source: `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.json`

### 19. GF-019 - Encode validated attestation as the preferred B64 secret.

State: `BLOCKED_BY_HOSTED_ATTESTATION`

Command:

```bash
npm run gateforge:attestation-secret-pack -- --write-b64
```

Evidence required:
- 46_attestation_secret_pack.md reports READY without printing the packet value.
- At least one attestation local secret file is READY.

Unblock evidence: Hosted staging attestation packet exists, is sanitized, and validates.

Source: `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.json`

### 20. GF-021 - Upload local secret pack to GitHub Actions after validation.

State: `BLOCKED_BY_SECRET_READINESS`

Command:

```bash
npm run gateforge:hosted-unblock -- --apply --prepare-attestation
```

Evidence required:
- 39_github_secrets_presence_audit.md reports READY.
- 40_missing_github_secrets_remediation.md reports READY or no missing runtime/attestation secrets.

Unblock evidence: All runtime secret files and one attestation option are READY without printing values.

Source: `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.json`

### 21. GF-022 - Trigger GateForge Hosted Staging Strict.

State: `BLOCKED_BY_GITHUB_SECRET_READINESS`

Command:

```bash
npm run gateforge:trigger-hosted-strict
```

Evidence required:
- 41_hosted_strict_trigger_attempt.md reports TRIGGERED or dry-run readiness in smoke.
- Hosted Staging Strict GitHub workflow completes successfully with sanitized artifact upload.

Unblock evidence: GitHub Actions has all runtime secrets and one hosted attestation secret.

Source: `gateforge-audit/run-2026-06-23-1035/53_hosted_dependency_chain.json`

## Safety

- Secret values printed: `NO`
- Production mutated: `NO`
- Source dumps included: `NO`
