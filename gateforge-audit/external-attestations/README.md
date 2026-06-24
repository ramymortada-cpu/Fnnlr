# GateForge External Attestations

This folder is for sanitized hosted/provider/legal evidence that cannot be produced by local code alone.

Use the template:

```bash
cp gateforge-audit/external-attestations/hosted-staging-attestation.template.json gateforge-audit/external-attestations/hosted-staging-attestation.json
```

Fill only safe references:

- GitHub Actions URLs
- artifact names
- screenshot IDs
- ticket IDs
- sanitized log IDs
- paths under `gateforge-audit/` or `docs/`

Never paste secrets, raw tokens, connection strings, private keys, customer PII, or full provider payloads.

Validate:

```bash
npm run gateforge:external-check
npm run gateforge:attestation-secret-pack -- --write-b64
```

The check must pass before requesting `CONDITIONAL_GO`.

The secret pack writes `GATEFORGE_HOSTED_STAGING_ATTESTATION_B64` under `/tmp/fnnlr-gateforge-secrets` only after the packet passes validation. It never prints the packet body or the base64 secret value.
