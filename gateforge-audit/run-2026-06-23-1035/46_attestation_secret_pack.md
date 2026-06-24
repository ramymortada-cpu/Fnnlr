# GateForge Attestation Secret Pack

Generated: `2026-06-24T12:58:09.655Z`

This pack validates the hosted staging attestation packet before it can be encoded as a GitHub Actions secret. It never prints the packet body or base64 secret value.

## Status

- Decision: `BLOCKED`
- Packet: `gateforge-audit/external-attestations/hosted-staging-attestation.json`
- B64 target file: `/tmp/fnnlr-gateforge-secrets/GATEFORGE_HOSTED_STAGING_ATTESTATION_B64`
- B64 file written: `NO`

## Details

- packet not found: gateforge-audit/external-attestations/hosted-staging-attestation.json

## Next Command

Fix the attestation packet until `npm run gateforge:external-check` passes, then rerun this pack with `-- --write-b64`.
