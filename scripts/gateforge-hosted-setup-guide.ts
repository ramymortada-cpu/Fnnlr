#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { loadHostedSecretsManifest } from './gateforge-hosted-secrets-manifest.js';

const outPath = 'gateforge-audit/run-2026-06-23-1035/38_hosted_staging_operator_setup.md';
const workflow = 'GateForge Hosted Staging Strict';
const { attestationSecrets, runtimeSecrets } = loadHostedSecretsManifest();
const checkOnly = process.argv.includes('--check');

const secretCommands = runtimeSecrets.map((name) => `gh secret set ${name}`).join('\n');
const now = new Date().toISOString();

function renderGuide(generatedAt: string) {
  return `# Hosted Staging Operator Setup

Generated: \`${generatedAt}\`

This is the operator checklist for converting GateForge from \`CANNOT_APPROVE\` to a defensible \`CONDITIONAL_GO\`. It does not contain secret values.

## Workflow To Run

\`\`\`bash
gh workflow run "${workflow}"
\`\`\`

Preferred trigger command:

\`\`\`bash
npm run gateforge:trigger-hosted-strict
\`\`\`

The trigger runs the secret-name audit first and refuses to start the workflow if any required secret name is missing.

Then monitor:

\`\`\`bash
gh run list --workflow "${workflow}" --limit 1
\`\`\`

To audit repository secret names without triggering:

\`\`\`bash
npm run gateforge:github-secrets-audit
\`\`\`

If secrets are missing, follow \`gateforge-audit/run-2026-06-23-1035/40_missing_github_secrets_remediation.md\`.

## Attestation Packet

Preferred secret:

\`\`\`bash
npm run gateforge:attestation-secret-pack -- --write-b64
npm run gateforge:hosted-unblock -- --dry-run --prepare-attestation
npm run gateforge:hosted-unblock -- --apply --prepare-attestation
\`\`\`

Alternative secret:

\`\`\`bash
gh secret set GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON --body-file gateforge-audit/external-attestations/hosted-staging-attestation.json
\`\`\`

The packet must pass locally before upload:

\`\`\`bash
npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json
npm run gateforge:attestation-secret-pack
\`\`\`

## Runtime Secrets

Preferred local preparation path:

\`\`\`bash
npm run gateforge:local-secrets-env-template
cp gateforge-audit/run-2026-06-23-1035/49_local_secret_env_template.env /secure/path/fnnlr-staging.env
npm run gateforge:import-local-secrets -- --env-file /secure/path/fnnlr-staging.env --require-all
npm run gateforge:hosted-readiness-doctor
\`\`\`

The generated env template contains placeholders only. Fill the copied file outside git, then import it so every row validates before any local secret file is written.

Reference the sanitized template guide at \`gateforge-audit/run-2026-06-23-1035/49_local_secret_env_template.md\`.
The readiness doctor also writes machine-readable status to \`gateforge-audit/run-2026-06-23-1035/44_hosted_readiness_doctor.json\`.

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
11. GateForge external closeout validator.
12. GateForge hosted dependency chain.
13. GateForge hosted readiness contract.
14. GateForge open P0 terminal runbook.
15. GateForge final gate.

The strict artifact must include:

- \`gateforge-audit/run-*/44_hosted_readiness_doctor.md\`
- \`gateforge-audit/run-*/44_hosted_readiness_doctor.json\`
- \`gateforge-audit/run-*/52_external_closeout_validator.md\`
- \`gateforge-audit/run-*/52_external_closeout_validator.json\`
- \`gateforge-audit/run-*/53_hosted_dependency_chain.md\`
- \`gateforge-audit/run-*/53_hosted_dependency_chain.json\`
- \`gateforge-audit/run-*/54_hosted_readiness_contract.md\`
- \`gateforge-audit/run-*/54_hosted_readiness_contract.json\`
- \`gateforge-audit/run-*/55_open_p0_terminal_runbook.md\`
- \`gateforge-audit/run-*/55_open_p0_terminal_runbook.json\`

## Failure Interpretation

- Missing attestation secret: upload the sanitized packet using one of the attestation commands above.
- GitHub secrets audit failure: set every missing repository secret name, then rerun \`npm run gateforge:github-secrets-audit\`.
- Hosted secrets preflight failure: set every listed GitHub Actions secret; the preflight prints names only, never values.
- External evidence failure: a required packet item is not \`PASS\`, has no owner, has no evidence refs, or contains an unsafe ref.
- Hosted live CI or Postgres failure: staging database/runtime evidence is still not accepted.
- Closeout/dependency/readiness/runbook contract failure: local and hosted evidence boundaries drifted; do not approve GA until all validators are green.
- Final gate failure: at least one applicable P0 is still missing runtime or external evidence.

Do not mark items \`PASS\` unless the evidence exists and is safe to reference.
`;
}

const body = renderGuide(now);

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expected = renderGuide(expectedGeneratedAt);
  const current = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``)
    : '';

  if (current !== expected) {
    console.error('GateForge hosted setup guide: FAIL');
    if (!current) console.error(`  - missing generated guide: ${outPath}`);
    else console.error(`  - stale generated guide: ${outPath}`);
    console.error('Run: npm run gateforge:hosted-setup-guide');
    process.exit(1);
  }

  console.log('GateForge hosted setup guide: PASS');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`GateForge hosted setup guide: wrote ${outPath}`);
