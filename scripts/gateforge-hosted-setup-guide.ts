#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const outPath = 'gateforge-audit/run-2026-06-23-1035/38_hosted_staging_operator_setup.md';
const workflow = 'GateForge Hosted Staging Strict';
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();

const secretCommands = runtimeSecrets.map((name) => `gh secret set ${name}`).join('\n');
const now = new Date().toISOString();
const body = `# Hosted Staging Operator Setup

Generated: \`${now}\`

This is the operator checklist for converting GateForge from \`CANNOT_APPROVE\` to a defensible \`CONDITIONAL_GO\`. It does not contain secret values.

## Workflow To Run

\`\`\`bash
gh workflow run "${workflow}"
\`\`\`

Then monitor:

\`\`\`bash
gh run list --workflow "${workflow}" --limit 1
\`\`\`

## Attestation Packet

Preferred secret:

\`\`\`bash
base64 -i gateforge-audit/external-attestations/hosted-staging-attestation.json | gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_B64 --body-file -
\`\`\`

Alternative secret:

\`\`\`bash
gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON --body-file gateforge-audit/external-attestations/hosted-staging-attestation.json
\`\`\`

The packet must pass locally before upload:

\`\`\`bash
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
\`\`\`

## Runtime Secrets

Set these repository secrets with safe staging values:

\`\`\`bash
${secretCommands}
\`\`\`

## Required Secret Names

### Attestation

${attestationSecrets.map((name) => `- \`${name}\``).join('\n')}

### Runtime

${runtimeSecrets.map((name) => `- \`${name}\``).join('\n')}

## Pass Criteria

The strict workflow must complete these steps:

1. Hosted secrets preflight.
2. Prepare hosted attestation packet.
3. Validate external evidence packet.
4. Typecheck.
5. Hosted live CI.
6. Hosted Postgres tests.
7. Hosted health gate.
8. Hosted deploy smoke.
9. GateForge GA unblock hosted evidence.
10. GateForge final report.
11. GateForge final gate.

## Failure Interpretation

- Missing attestation secret: upload the sanitized packet using one of the attestation commands above.
- Hosted secrets preflight failure: set every listed GitHub Actions secret; the preflight prints names only, never values.
- External evidence failure: a required packet item is not \`PASS\`, has no owner, has no evidence refs, or contains an unsafe ref.
- Hosted live CI or Postgres failure: staging database/runtime evidence is still not accepted.
- Final gate failure: at least one applicable P0 is still missing runtime or external evidence.

Do not mark items \`PASS\` unless the evidence exists and is safe to reference.
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`GateForge hosted setup guide: wrote ${outPath}`);
