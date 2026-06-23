# Dependency Security

Status: IMPLEMENTED_EVIDENCE_COMMANDS

Required commands:

- `npm run audit:high`
- `npm run sbom:generate`

Acceptance:

- No unresolved high/critical advisories for GA.
- SBOM artifact exists at `gateforge-audit/evidence/sbom.json`.
- Any accepted vulnerability needs owner, expiry date, and compensating control.
