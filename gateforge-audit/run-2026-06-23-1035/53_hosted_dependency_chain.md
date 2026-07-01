# GateForge Hosted Dependency Chain

Generated: `2026-07-01T19:17:18.629Z`

Decision: `PASS`

This file turns the remaining hosted dependency gates into an ordered, machine-checked execution chain. It does not contain secret values and does not claim GA approval.

## Chain Summary

- Source status: `docs/SAAS_MOAT_EXECUTION_STATUS.json`
- Total moat actions: `165`
- Dependency gates covered: `5`
- Scope: `GF-017, GF-018, GF-019, GF-021, GF-022`

| Order | ID | Current failure mode | Command | Downstream |
| ---: | --- | --- | --- | --- |
| 1 | `GF-017` | `BLOCKED_BY_SECRET_READINESS` | `npm run gateforge:secret-replacement-packet` | `GF-018`, `GF-021` |
| 2 | `GF-018` | `BLOCKED_BY_HOSTED_ATTESTATION` | `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` | `GF-019`, `GF-022` |
| 3 | `GF-019` | `BLOCKED_BY_HOSTED_ATTESTATION` | `npm run gateforge:attestation-secret-pack -- --write-b64` | `GF-021` |
| 4 | `GF-021` | `BLOCKED_BY_SECRET_READINESS` | `npm run gateforge:hosted-unblock -- --apply --prepare-attestation` | `GF-022` |
| 5 | `GF-022` | `BLOCKED_BY_GITHUB_SECRET_READINESS` | `npm run gateforge:trigger-hosted-strict` | `GF-023`, `GF-024` |

## Details

### 1. GF-017 - Run local secret replacement packet after operator values exist.

Command:

```bash
npm run gateforge:secret-replacement-packet
```

Prerequisites:
- GF-001..GF-016 provider/runtime values have been created outside git.
- Local secret scaffold exists under the configured secure local secret directory.

Evidence required:
- 45_secret_replacement_packet.md lists every runtime and attestation secret without values.
- Local secret files check reports every runtime secret READY and at least one attestation option READY.

Output evidence:
- `gateforge-audit/run-2026-06-23-1035/45_secret_replacement_packet.md`
- `gateforge-audit/run-2026-06-23-1035/45_secret_replacement_packet.csv`

Downstream:
- `GF-018`
- `GF-021`

### 2. GF-018 - Generate hosted staging attestation packet from real evidence only.

Command:

```bash
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
```

Prerequisites:
- Hosted staging evidence packet exists and contains sanitized provider/runtime proof.
- No local-only command output is treated as hosted proof.

Evidence required:
- hosted-staging-attestation.json validates with external-check.
- Attestation references live hosted evidence for DB, observability, email, AI cap, and smoke checks.

Output evidence:
- `gateforge-audit/external-attestations/hosted-staging-attestation.json`
- `gateforge-audit/external-attestations/HOSTED_STAGING_WAR_ROOM.md`

Downstream:
- `GF-019`
- `GF-022`

### 3. GF-019 - Encode validated attestation as the preferred B64 secret.

Command:

```bash
npm run gateforge:attestation-secret-pack -- --write-b64
```

Prerequisites:
- GF-018 validated the hosted attestation packet.
- Operator chose one attestation secret strategy: B64 preferred or JSON alternative.

Evidence required:
- 46_attestation_secret_pack.md reports READY without printing the packet value.
- At least one attestation local secret file is READY.

Output evidence:
- `gateforge-audit/run-2026-06-23-1035/46_attestation_secret_pack.md`

Downstream:
- `GF-021`

### 4. GF-021 - Upload local secret pack to GitHub Actions after validation.

Command:

```bash
npm run gateforge:hosted-unblock -- --apply --prepare-attestation
```

Prerequisites:
- GF-017 local runtime secrets are READY.
- GF-019 attestation secret is READY.
- GitHub CLI is authenticated for the target repository.

Evidence required:
- 39_github_secrets_presence_audit.md reports READY.
- 40_missing_github_secrets_remediation.md reports READY or no missing runtime/attestation secrets.

Output evidence:
- `gateforge-audit/run-2026-06-23-1035/39_github_secrets_presence_audit.md`
- `gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md`

Downstream:
- `GF-022`

### 5. GF-022 - Trigger GateForge Hosted Staging Strict.

Command:

```bash
npm run gateforge:trigger-hosted-strict
```

Prerequisites:
- GF-021 confirms GitHub secret names are present.
- GateForge Hosted Staging Strict workflow exists and is dispatchable.

Evidence required:
- 41_hosted_strict_trigger_attempt.md reports TRIGGERED or dry-run readiness in smoke.
- Hosted Staging Strict GitHub workflow completes successfully with sanitized artifact upload.

Output evidence:
- `gateforge-audit/run-2026-06-23-1035/41_hosted_strict_trigger_attempt.md`
- `GitHub Actions artifact: gateforge-hosted-staging-strict`

Downstream:
- `GF-023`
- `GF-024`

## Safety

- Secret values printed: `NO`
- Production mutated: `NO`
- Source dumps included: `NO`
