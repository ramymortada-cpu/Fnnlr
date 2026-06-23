# Final Gate Current Decision

Generated: `2026-06-23T11:47:56.289Z`

Decision: `CANNOT_APPROVE`

Runtime context: `DISPOSABLE_LOCAL_STAGING_POSTGRES`

Score: `78-84/100 pending legal/provider attestation`

Runtime checks: `13/13 PASS`

External packet: `MISSING`

## Blocking Reasons

- external attestation packet missing: gateforge-audit/external-attestations/hosted-staging-attestation.json

## Next Command

```bash
npm run gateforge:final-gate
```

## Interpretation

This report is archival and always writes a current decision. The strict gate remains `npm run gateforge:final-gate`, which exits non-zero unless the decision can become `CONDITIONAL_GO`.
