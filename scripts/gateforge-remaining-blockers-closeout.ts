#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type Blocker = {
  id: string;
  owner: string;
  action: string;
  secrets: string[];
  providerSetup: string[];
  evidenceRequired: string[];
  validationCommands: string[];
  exitCriteria: string;
};
type DependencyGate = {
  id: string;
  owner: string;
  state: string;
  action: string;
  dependsOn: string[];
  command: string;
  evidenceRequired: string[];
  exitCriteria: string;
};

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/48_remaining_external_blocker_closeout.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/48_remaining_external_blocker_closeout.json`;
const checkOnly = process.argv.includes('--check');

const blockers: Blocker[] = [
  b('GF-001', 'Operator', 'Provision hosted staging control-plane Postgres.', ['CONTROL_PLANE_DATABASE_URL'], ['Create a hosted staging Postgres database dedicated to the control plane.'], ['Provider database identifier and sanitized successful hosted health gate output.'], ['npm run ci:live', 'npm run deploy:health-gate'], 'Hosted control-plane database is reachable from GitHub Actions without local-only evidence.'),
  b('GF-002', 'Operator', 'Provision tenant database admin access for staging.', ['TENANT_DB_ADMIN_URL'], ['Create a hosted staging admin connection that can create/drop tenant databases.'], ['Hosted tenant provision/delete test output and sanitized DB-per-tenant proof.'], ['npm run test:pg', 'npm run deploy:verify-restore'], 'Tenant DB creation, deletion, and isolation pass in hosted staging.'),
  b('GF-003', 'Operator', 'Set CONTROL_PLANE_DATABASE_URL in local secret pack and GitHub Actions.', ['CONTROL_PLANE_DATABASE_URL'], ['Write the staging control-plane URL to the local secret file, then upload by secret name only.'], ['Local secret files check PASS and GitHub secret name present.'], ['npm run gateforge:local-secret-files-check', 'npm run gateforge:github-secrets-audit'], 'Secret exists locally and in GitHub without printing the value.'),
  b('GF-004', 'Operator', 'Set TENANT_DB_ADMIN_URL in local secret pack and GitHub Actions.', ['TENANT_DB_ADMIN_URL'], ['Write the staging tenant admin URL to the local secret file, then upload by secret name only.'], ['Hosted strict live DB tests PASS.'], ['npm run gateforge:local-secret-files-check', 'npm run gateforge:github-secrets-audit', 'npm run test:pg'], 'Tenant admin secret is available to hosted strict checks.'),
  b('GF-005', 'Operator', 'Set TENANT_DB_HOST in local secret pack and GitHub Actions.', ['TENANT_DB_HOST'], ['Extract the staging tenant DB host from the provider without credentials.'], ['Local secret files check READY and hosted tenant routing proof.'], ['npm run gateforge:local-secret-files-check', 'npm run test:pg'], 'Tenant DB host is present and matches the hosted tenant admin target.'),
  b('GF-006', 'Operator', 'Create staging Sentry or equivalent error-monitoring project.', ['SENTRY_DSN'], ['Create a staging error-monitoring project with alert routing enabled.'], ['Sanitized project reference and alert proof attached to hosted attestation.'], ['npm run deploy:health-gate'], 'Error monitoring is a real hosted service, not a doc-only claim.'),
  b('GF-007', 'Operator', 'Set SENTRY_DSN for staging.', ['SENTRY_DSN'], ['Write the staging DSN to the local secret file, then upload it to GitHub Actions.'], ['Hosted strict monitoring item PASS.'], ['npm run gateforge:local-secret-files-check', 'npm run gateforge:github-secrets-audit', 'npm run deploy:health-gate'], 'Hosted runtime can initialize observability without exposing the DSN.'),
  b('GF-008', 'Operator', 'Create uptime monitor for /health.', ['UPTIME_HEALTHCHECK_URL'], ['Create an external uptime monitor pointed at the hosted staging /health endpoint.'], ['Monitor URL, screenshot/log reference, and successful health gate.'], ['npm run deploy:health-gate'], 'External uptime evidence exists outside local tests.'),
  b('GF-009', 'Operator', 'Set UPTIME_HEALTHCHECK_URL.', ['UPTIME_HEALTHCHECK_URL'], ['Write the uptime monitor URL to the local secret file, then upload it to GitHub Actions.'], ['GateForge secret check READY and hosted attestation item PASS.'], ['npm run gateforge:local-secret-files-check', 'npm run gateforge:github-secrets-audit', 'npm run deploy:health-gate'], 'Hosted gate can prove the configured uptime monitor.'),
  b('GF-010', 'Operator', 'Set ALERT_EMAIL_TO for staging operations.', ['ALERT_EMAIL_TO'], ['Choose a monitored staging operations inbox.'], ['Alert delivery proof in hosted evidence packet.'], ['npm run deploy:health-gate'], 'Operational alerts have a human recipient.'),
  b('GF-011', 'Operator', 'Set ALERT_WEBHOOK_URL for staging alerts.', ['ALERT_WEBHOOK_URL'], ['Create a staging alert webhook destination in the team response channel.'], ['Cron/webhook failure alert proof.'], ['npm run deploy:health-gate'], 'Machine-readable alert delivery proof exists.'),
  b('GF-012', 'Operator', 'Create Resend staging key or approved transactional email provider key.', ['RESEND_API_KEY'], ['Create a staging transactional email provider key with limited scope.'], ['Provider test send and DNS posture evidence.'], ['npm run deploy:smoke'], 'Transactional email provider is real and testable in staging.'),
  b('GF-013', 'Operator', 'Set RESEND_API_KEY.', ['RESEND_API_KEY'], ['Write the staging provider key to the local secret file, then upload it to GitHub Actions.'], ['Hosted strict email readiness evidence.'], ['npm run gateforge:local-secret-files-check', 'npm run gateforge:github-secrets-audit', 'npm run deploy:smoke'], 'Hosted smoke can send or validate transactional email readiness.'),
  b('GF-014', 'Operator', 'Verify sender domain and set EMAIL_FROM.', ['EMAIL_FROM'], ['Verify the sender domain/address with SPF, DKIM, and DMARC evidence.'], ['SPF/DKIM/DMARC evidence and provider verified sender.'], ['npm run deploy:smoke'], 'Outbound transactional messages use a verified sender.'),
  b('GF-015', 'Operator', 'Set EMAIL_REPLY_TO.', ['EMAIL_REPLY_TO'], ['Choose a monitored support or founder reply-to address.'], ['Transactional provider config proof.'], ['npm run deploy:smoke'], 'Customer replies route to a monitored inbox.'),
  b('GF-016', 'Operator', 'Create capped Anthropic staging key.', ['ANTHROPIC_API_KEY'], ['Create a staging AI provider key with provider-side spend limits.'], ['Provider-side cap proof and AI gateway hosted smoke evidence.'], ['npm run verify:production-safety', 'npm run ci:live'], 'AI provider access is capped and audited before GA.'),
];
const dependencyGates: DependencyGate[] = [
  d(
    'GF-017',
    'Engineering',
    'BLOCKED_BY_SECRET_READINESS',
    'Run local secret replacement packet after operator values exist.',
    ['GF-001..GF-016'],
    'npm run gateforge:secret-replacement-packet',
    ['Local secret replacement packet shows all runtime secrets and one attestation option are READY without printing values.'],
    'Local runtime secret files are real, non-placeholder, non-empty, and provider-valid.',
  ),
  d(
    'GF-018',
    'Engineering',
    'BLOCKED_BY_HOSTED_ATTESTATION',
    'Generate hosted staging attestation packet from real evidence only.',
    ['GF-017', 'hosted strict staging artifacts'],
    'npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json',
    ['External attestation contract validates PASS items, evidence refs, supported blocker IDs, and successful hosted run URLs.'],
    'Hosted staging attestation JSON passes strict external validation.',
  ),
  d(
    'GF-019',
    'Engineering',
    'BLOCKED_BY_HOSTED_ATTESTATION',
    'Encode validated attestation as the preferred B64 secret.',
    ['GF-018'],
    'npm run gateforge:attestation-secret-pack -- --write-b64',
    ['B64 attestation packet is generated from validated hosted evidence without exposing raw secret values.'],
    'One hosted attestation secret option is ready for GitHub Actions.',
  ),
  d(
    'GF-021',
    'Engineering',
    'BLOCKED_BY_SECRET_READINESS',
    'Upload local secret pack to GitHub Actions after validation.',
    ['GF-017', 'GF-019'],
    'npm run gateforge:hosted-unblock -- --apply --prepare-attestation',
    ['GitHub secret name audit shows all required runtime secrets and one attestation option present.'],
    'GitHub Actions has every required secret name, verified without printing values.',
  ),
  d(
    'GF-022',
    'Engineering',
    'BLOCKED_BY_GITHUB_SECRET_READINESS',
    'Trigger GateForge Hosted Staging Strict.',
    ['GF-021'],
    'npm run gateforge:trigger-hosted-strict',
    ['Hosted strict workflow success URL and sanitized artifacts for live DB, monitoring, email, AI, restore, and attestation checks.'],
    'Hosted strict workflow succeeds on current HEAD and final GateForge review can consume the artifacts.',
  ),
];

function b(
  id: string,
  owner: string,
  action: string,
  secrets: string[],
  providerSetup: string[],
  evidenceRequired: string[],
  validationCommands: string[],
  exitCriteria: string,
): Blocker {
  return { id, owner, action, secrets, providerSetup, evidenceRequired, validationCommands, exitCriteria };
}

function d(
  id: string,
  owner: string,
  state: string,
  action: string,
  dependsOn: string[],
  command: string,
  evidenceRequired: string[],
  exitCriteria: string,
): DependencyGate {
  return { id, owner, state, action, dependsOn, command, evidenceRequired, exitCriteria };
}

function validate() {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const blocker of blockers) {
    if (ids.has(blocker.id)) errors.push(`duplicate blocker ${blocker.id}`);
    ids.add(blocker.id);
    if (!/^GF-0(0[1-9]|1[0-6])$/.test(blocker.id)) errors.push(`${blocker.id} is not one of GF-001..GF-016`);
    if (!blocker.secrets.length) errors.push(`${blocker.id} missing secret mapping`);
    if (!blocker.evidenceRequired.length) errors.push(`${blocker.id} missing evidence requirement`);
    if (!blocker.validationCommands.length) errors.push(`${blocker.id} missing validation command`);
    if (!blocker.exitCriteria.trim()) errors.push(`${blocker.id} missing exit criteria`);
  }
  if (blockers.length !== 16) errors.push(`expected 16 blockers, found ${blockers.length}`);
  const expectedDependencyIds = ['GF-017', 'GF-018', 'GF-019', 'GF-021', 'GF-022'];
  const actualDependencyIds = dependencyGates.map((gate) => gate.id);
  if (JSON.stringify(actualDependencyIds) !== JSON.stringify(expectedDependencyIds)) {
    errors.push(`expected dependency gates ${expectedDependencyIds.join(',')}, found ${actualDependencyIds.join(',')}`);
  }
  for (const gate of dependencyGates) {
    if (!gate.dependsOn.length) errors.push(`${gate.id} missing dependency mapping`);
    if (!gate.command.trim()) errors.push(`${gate.id} missing command`);
    if (!gate.evidenceRequired.length) errors.push(`${gate.id} missing evidence requirement`);
    if (!gate.exitCriteria.trim()) errors.push(`${gate.id} missing exit criteria`);
  }
  if (errors.length) {
    console.error('GateForge remaining blocker closeout: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }
}

function list(values: string[]) {
  return values.map((value) => `- ${value}`).join('\n');
}

function renderMarkdown(generatedAt: string) {
  const rows = blockers
    .map((blocker) => `| \`${blocker.id}\` | ${blocker.owner} | ${blocker.action} | ${blocker.secrets.map((secret) => `\`${secret}\``).join('<br>')} | ${blocker.validationCommands.map((command) => `\`${command}\``).join('<br>')} |`)
    .join('\n');
  const dependencyRows = dependencyGates
    .map((gate) => `| \`${gate.id}\` | ${gate.owner} | \`${gate.state}\` | ${gate.action} | ${gate.dependsOn.map((dependency) => `\`${dependency}\``).join('<br>')} | \`${gate.command}\` |`)
    .join('\n');
  const sections = blockers
    .map((blocker) => `### ${blocker.id} - ${blocker.action}

Owner: ${blocker.owner}

Secret names:
${list(blocker.secrets.map((secret) => `\`${secret}\``))}

Provider setup:
${list(blocker.providerSetup)}

Evidence required:
${list(blocker.evidenceRequired)}

Validation commands:
${list(blocker.validationCommands.map((command) => `\`${command}\``))}

Exit criteria: ${blocker.exitCriteria}
`)
    .join('\n');
  const dependencySections = dependencyGates
    .map((gate) => `### ${gate.id} - ${gate.action}

Owner: ${gate.owner}

State: \`${gate.state}\`

Depends on:
${list(gate.dependsOn.map((dependency) => `\`${dependency}\``))}

Command:
- \`${gate.command}\`

Evidence required:
${list(gate.evidenceRequired)}

Exit criteria: ${gate.exitCriteria}
`)
    .join('\n');

  return `# GateForge Remaining External Blocker Closeout

Generated: \`${generatedAt}\`

This is the execution checklist for the only remaining SaaS moat blockers after the local 165-point board was reduced to externally blocked GA evidence. It contains secret names, provider setup requirements, evidence requirements, and validation commands only. Do not paste secret values into this file.

## Current Truth

- Remaining blockers: \`${blockers.length}\`
- Dependency gates: \`${dependencyGates.length}\`
- Total open P0 closeout path: \`${blockers.length + dependencyGates.length}\`
- Scope: \`GF-001..GF-016\`
- Dependency gate scope: \`GF-017, GF-018, GF-019, GF-021, GF-022\`
- Status: \`BLOCKED_EXTERNAL\`
- Target after closure: hosted strict evidence, then final GateForge gate review.
- Safety: no production mutation, no secret values, no source dump.

## Fast Matrix

| ID | Owner | Action | Secret names | Validation |
| --- | --- | --- | --- | --- |
${rows}

## Dependency Gates

These five gates are not provider setup items themselves; they are the terminal proof chain that converts the 16 external blockers into hosted GA evidence.

| ID | Owner | State | Action | Depends on | Command |
| --- | --- | --- | --- | --- | --- |
${dependencyRows}

## Closeout Steps

1. Run \`npm run gateforge:scaffold-local-secrets\`.
2. Replace placeholder local files under \`/tmp/fnnlr-gateforge-secrets\`.
3. Run \`npm run gateforge:local-secret-files-check\`.
4. Upload names with \`npm run gateforge:upload-local-secrets -- --apply\`.
5. Run \`npm run gateforge:github-secrets-audit\`.
6. Run \`npm run gateforge:hosted-unblock -- --apply --prepare-attestation\`.
7. Watch \`GateForge Hosted Staging Strict\` and attach sanitized artifact links.
8. Run \`npm run gateforge:final-gate && npm run gateforge:final-report\`.

## Blocker Details

${sections}

## Dependency Gate Details

${dependencySections}
`;
}

function renderJson(generatedAt: string) {
  return {
    generatedAt,
    status: 'BLOCKED_EXTERNAL',
    count: blockers.length,
    dependencyGateCount: dependencyGates.length,
    totalOpenP0Closeout: blockers.length + dependencyGates.length,
    blockerIds: blockers.map((blocker) => blocker.id),
    dependencyGateIds: dependencyGates.map((gate) => gate.id),
    blockers,
    dependencyGates,
    safety: {
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
}

validate();

if (checkOnly) {
  const expectedGeneratedAt = 'CHECK_TIMESTAMP';
  const expectedMarkdown = `${renderMarkdown(expectedGeneratedAt).trimEnd()}\n`;
  const expectedJson = `${JSON.stringify(renderJson(expectedGeneratedAt), null, 2)}\n`;
  const errors: string[] = [];

  if (!fs.existsSync(outPath)) {
    errors.push(`missing generated markdown: ${outPath}`);
  } else {
    const currentMarkdown = fs.readFileSync(outPath, 'utf8').replace(/Generated: `[^`]+`/, `Generated: \`${expectedGeneratedAt}\``);
    if (currentMarkdown !== expectedMarkdown) errors.push(`stale generated markdown: ${outPath}`);
  }

  if (!fs.existsSync(jsonOutPath)) {
    errors.push(`missing generated json: ${jsonOutPath}`);
  } else {
    const currentJson = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8')) as ReturnType<typeof renderJson>;
    const normalizedJson = `${JSON.stringify({ ...currentJson, generatedAt: expectedGeneratedAt }, null, 2)}\n`;
    if (normalizedJson !== expectedJson) errors.push(`stale generated json: ${jsonOutPath}`);
  }

  if (errors.length) {
    console.error('GateForge remaining blocker closeout: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('Run: npm run gateforge:remaining-blockers-closeout');
    process.exit(1);
  }

  console.log(`GateForge remaining blocker closeout: PASS (${blockers.length} blockers)`);
  process.exit(0);
}

const generatedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${renderMarkdown(generatedAt).trimEnd()}\n`);
fs.writeFileSync(jsonOutPath, `${JSON.stringify(renderJson(generatedAt), null, 2)}\n`);
console.log(`GateForge remaining blocker closeout: wrote ${outPath}`);
console.log(`GateForge remaining blocker closeout: wrote ${jsonOutPath}`);
