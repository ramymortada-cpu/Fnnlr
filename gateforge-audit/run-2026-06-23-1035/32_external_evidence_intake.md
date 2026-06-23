# External Evidence Intake

Status: `READY_FOR_HOSTED_ATTESTATIONS`

The repo now has a strict intake path for the remaining non-local GateForge blockers.

## Files

- `gateforge-audit/external-attestations/README.md`
- `gateforge-audit/external-attestations/hosted-staging-attestation.template.json`
- `scripts/gateforge-external-check.ts`

## Command

```bash
npm run gateforge:external-check
```

By default it validates:

`gateforge-audit/external-attestations/hosted-staging-attestation.json`

## Required PASS Items

- hosted staging GateForge run
- provider webhook replay/idempotency proof
- monitoring and alerting proof
- hosted restore drill
- legal/commercial final approval
- hosted admin MFA runtime proof
- hosted AI budget runtime proof

## Safety

The validator rejects evidence references that appear to contain secret/password/token/private-key wording and only accepts safe reference prefixes such as GitHub URLs, artifacts, screenshots, tickets, logs, `docs/`, and `gateforge-audit/`.

## Gate Interpretation

When `npm run gateforge:external-check` passes against real hosted evidence, the remaining evidence posture can move from:

`CONDITIONAL_GO_CANDIDATE_PENDING_HUMAN_AND_HOSTED_PROVIDER_ATTESTATION`

to:

`CONDITIONAL_GO`
