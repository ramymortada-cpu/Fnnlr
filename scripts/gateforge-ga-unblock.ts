#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type CommandResult = {
  name: string;
  command: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'BLOCKED_BY_ENVIRONMENT';
  exitCode: number | null;
  evidenceClass: 'LOCAL' | 'STAGING_LIVE' | 'HUMAN';
  notes: string;
  outputExcerpt: string;
};

const runDir = path.resolve('gateforge-audit/run-2026-06-23-1035');
const evidenceDir = path.join(runDir, 'ga-unblock-evidence');
const checkOnly = process.argv.includes('--check');
fs.mkdirSync(evidenceDir, { recursive: true });

const requiredEnv = [
  'CONTROL_PLANE_DATABASE_URL',
  'TENANT_DB_ADMIN_URL',
  'TENANT_DB_HOST',
  'TENANT_CREDENTIAL_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'FNNLR_CRON_SECRET',
  'AUTH_MFA_ENCRYPTION_KEY',
  'FNNLR_AI_TENANT_DAILY_USD_CAP',
  'FNNLR_AI_GLOBAL_DAILY_USD_CAP',
  'SENTRY_DSN',
  'UPTIME_HEALTHCHECK_URL',
  'ALERT_EMAIL_TO',
  'ALERT_WEBHOOK_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_REPLY_TO',
  'ANTHROPIC_API_KEY',
] as const;

const commands: Omit<CommandResult, 'status' | 'exitCode' | 'outputExcerpt'>[] = [
  { name: 'typecheck', command: 'npm run typecheck', evidenceClass: 'LOCAL', notes: 'Static TypeScript verification.' },
  {
    name: 'focused_phase_1_tests',
    command: 'npx tsx --test tests/auth.test.ts tests/brains.test.ts tests/integrations.test.ts tests/route-matrix.test.ts tests/gateforge-controls.test.ts tests/data-lifecycle.test.ts',
    evidenceClass: 'LOCAL',
    notes: 'Focused GateForge Phase 1 controls.',
  },
  { name: 'full_local_tests', command: 'npm test', evidenceClass: 'LOCAL', notes: 'Full local test suite.' },
  { name: 'local_ci', command: 'npm run ci', evidenceClass: 'LOCAL', notes: 'Local aggregate release safety.' },
  { name: 'dependency_audit_high', command: 'npm run audit:high', evidenceClass: 'LOCAL', notes: 'High/critical dependency audit.' },
  { name: 'sbom', command: 'npm run sbom:generate', evidenceClass: 'LOCAL', notes: 'SBOM evidence generation.' },
  { name: 'proof_docs', command: 'npm run proof:check -- docs', evidenceClass: 'LOCAL', notes: 'Proof pack consistency.' },
  { name: 'commercial_docs', command: 'npm run commercial:check -- docs', evidenceClass: 'LOCAL', notes: 'Commercial packaging consistency.' },
  { name: 'deploy_smoke', command: 'npm run deploy:smoke', evidenceClass: 'LOCAL', notes: 'Local deployment smoke.' },
  { name: 'live_pg_tests', command: 'npm run test:pg', evidenceClass: 'STAGING_LIVE', notes: 'Live Postgres tenant isolation proof.' },
  { name: 'live_ci', command: 'npm run ci:live', evidenceClass: 'STAGING_LIVE', notes: 'Hosted/staging CI proof.' },
  { name: 'health_gate', command: 'npm run deploy:health-gate', evidenceClass: 'STAGING_LIVE', notes: 'Runtime production health gate.' },
  { name: 'restore_verify_probe', command: 'npm run deploy:verify-restore -- control gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/control-restore-manifest.json', evidenceClass: 'STAGING_LIVE', notes: 'Restore verification probe; requires restored DB/schema evidence to PASS.' },
];

function redact(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s'")]+/gi, 'postgres://<redacted>')
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, '<redacted-api-key>')
    .replace(/([A-Z0-9_]*(?:KEY|SECRET|TOKEN|DSN|PASSWORD|URL)=)[^\s'"]+/g, '$1<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>');
}

function excerpt(output: string): string {
  return redact(output).split('\n').slice(-80).join('\n').trim();
}

function run(command: string): { exitCode: number | null; output: string } {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    exitCode: result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
  };
}

function classify(template: Omit<CommandResult, 'status' | 'exitCode' | 'outputExcerpt'>, exitCode: number | null, output: string): CommandResult['status'] {
  const text = output.toLowerCase();
  if (exitCode === 0) {
    if (template.evidenceClass === 'STAGING_LIVE' && /# skipped ([1-9]\d*)|no database configured/.test(text)) return 'BLOCKED_BY_ENVIRONMENT';
    return 'PASS';
  }
  if (template.evidenceClass === 'STAGING_LIVE' && /no live db configured|not set|missing|requires a valid database_url|control_plane_database_url/.test(text)) {
    return 'BLOCKED_BY_ENVIRONMENT';
  }
  return 'FAIL';
}

function write(file: string, body: string) {
  fs.writeFileSync(path.join(runDir, file), `${body.trim()}\n`);
}

function table(rows: string[][]): string {
  return rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
}

function failCheck(message: string): never {
  console.error(`GateForge GA unblock evidence check: FAIL - ${message}`);
  process.exit(1);
}

function readRequired(filePath: string): string {
  if (!fs.existsSync(filePath)) failCheck(`${filePath} is missing`);
  return fs.readFileSync(filePath, 'utf8');
}

function assertNoSecretDump(filePath: string, content: string): void {
  if (/postgres(?:ql)?:\/\/[^\s'")]+/i.test(content)) failCheck(`${filePath} contains an unredacted database URL`);
  if (/sk-[A-Za-z0-9_-]{8,}/.test(content)) failCheck(`${filePath} contains an unredacted API-key-like value`);
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(content)) failCheck(`${filePath} contains an unredacted bearer token`);
}

function assertMarkdownGeneratedAt(filePath: string, content: string, generatedAt: string): void {
  if (!content.includes(`Generated: \`${generatedAt}\``)) {
    failCheck(`${filePath} does not match summary generatedAt ${generatedAt}`);
  }
}

function runCheckOnly(): never {
  const artifactNames = [
    '24_ga_unblock_evidence_pack.md',
    '25_live_command_results.md',
    '26_remaining_blockers.md',
    '27_recomputed_score.md',
    '28_conditional_go_request.md',
  ];
  const summaryPath = path.join(evidenceDir, 'summary.json');
  const summaryContent = readRequired(summaryPath);
  assertNoSecretDump(summaryPath, summaryContent);

  let summary: {
    generatedAt?: string;
    evidenceContext?: string;
    gate?: string;
    score?: string;
    env?: { name?: string; present?: boolean }[];
    results?: {
      name?: string;
      command?: string;
      status?: CommandResult['status'];
      exitCode?: number | null;
      evidenceClass?: CommandResult['evidenceClass'];
      notes?: string;
      log?: string;
    }[];
  };
  try {
    summary = JSON.parse(summaryContent);
  } catch (error) {
    failCheck(`summary.json is not valid JSON: ${String(error)}`);
  }

  if (!summary.generatedAt) failCheck('summary.json missing generatedAt');
  if (!summary.evidenceContext) failCheck('summary.json missing evidenceContext');
  if (!summary.gate) failCheck('summary.json missing gate');
  if (!summary.score) failCheck('summary.json missing score');
  if (!Array.isArray(summary.env) || summary.env.length !== requiredEnv.length) {
    failCheck(`summary.json env list must contain ${requiredEnv.length} required inputs`);
  }
  const envNames = new Set(summary.env.map((entry) => entry.name));
  for (const name of requiredEnv) {
    if (!envNames.has(name)) failCheck(`summary.json missing env status for ${name}`);
  }

  if (!Array.isArray(summary.results) || summary.results.length !== commands.length) {
    failCheck(`summary.json results list must contain ${commands.length} commands`);
  }

  const resultNames = new Set(summary.results.map((entry) => entry.name));
  for (const command of commands) {
    if (!resultNames.has(command.name)) failCheck(`summary.json missing result for ${command.name}`);
  }

  const liveResults = summary.results.filter((entry) => entry.evidenceClass === 'STAGING_LIVE');
  const localResults = summary.results.filter((entry) => entry.evidenceClass === 'LOCAL');
  if (liveResults.length === 0) failCheck('summary.json does not include staging/live checks');
  if (localResults.length === 0) failCheck('summary.json does not include local checks');

  const localPass = localResults.every((entry) => entry.status === 'PASS');
  const livePass = liveResults.every((entry) => entry.status === 'PASS');
  const hardFails = summary.results.filter((entry) => entry.status === 'FAIL');
  const expectedGate = 'CANNOT_APPROVE';
  const commandsCouldRequestConditionalGo = localPass && livePass && hardFails.length === 0;
  if (summary.gate !== expectedGate) {
    failCheck(`summary.json gate is ${summary.gate}; expected ${expectedGate} until human attestation can be proven`);
  }
  if (commandsCouldRequestConditionalGo && !summary.score.includes('pending legal')) {
    failCheck('summary.json score must keep legal/provider attestation pending when runtime commands pass');
  }

  for (const result of summary.results) {
    if (!result.name || !result.command || !result.status || !result.evidenceClass || !result.log) {
      failCheck('summary.json contains an incomplete command result');
    }
    if (!['PASS', 'FAIL', 'SKIPPED', 'BLOCKED_BY_ENVIRONMENT'].includes(result.status)) {
      failCheck(`summary.json has invalid status for ${result.name}: ${result.status}`);
    }
    const logPath = path.join(runDir, result.log);
    const logContent = readRequired(logPath);
    assertNoSecretDump(logPath, logContent);
  }

  for (const artifactName of artifactNames) {
    const artifactPath = path.join(runDir, artifactName);
    const content = readRequired(artifactPath);
    assertNoSecretDump(artifactPath, content);
    assertMarkdownGeneratedAt(artifactPath, content, summary.generatedAt);
  }

  const evidencePack = readRequired(path.join(runDir, '24_ga_unblock_evidence_pack.md'));
  if (!evidencePack.includes(`Gate decision: \`${summary.gate}\``)) {
    failCheck('24_ga_unblock_evidence_pack.md gate does not match summary.json');
  }
  if (!evidencePack.includes(`Score movement: \`${summary.score}\``)) {
    failCheck('24_ga_unblock_evidence_pack.md score does not match summary.json');
  }
  const conditionalRequest = readRequired(path.join(runDir, '28_conditional_go_request.md'));
  if (!conditionalRequest.includes('## Conditions To Approve')) {
    failCheck('28_conditional_go_request.md is missing Conditions To Approve');
  }

  console.log(`GateForge GA unblock evidence check: PASS (${summary.gate})`);
  console.log(`  checked ${artifactNames.length} markdown artifacts`);
  console.log(`  checked ${summary.results.length} command logs`);
  process.exit(0);
}

if (checkOnly) runCheckOnly();

const restoreManifest = path.join(evidenceDir, 'control-restore-manifest.json');
if (!fs.existsSync(restoreManifest)) {
  fs.writeFileSync(restoreManifest, JSON.stringify(['tenants', 'users', 'workspaces', 'workspace_members'], null, 2));
}

const now = new Date().toISOString();
const evidenceContext = process.env.GATEFORGE_EVIDENCE_CONTEXT || 'LOCAL_OR_CI';
const envStatus = requiredEnv.map((name) => ({ name, present: Boolean(process.env[name]) }));
const results: CommandResult[] = [];

for (const c of commands) {
  const r = run(c.command);
  const status = classify(c, r.exitCode, r.output);
  const outputExcerpt = excerpt(r.output);
  results.push({ ...c, status, exitCode: r.exitCode, outputExcerpt });
  fs.writeFileSync(path.join(evidenceDir, `${c.name}.log`), `${outputExcerpt}\n`);
}

const missingEnv = envStatus.filter((e) => !e.present).map((e) => e.name);
const localPass = results.filter((r) => r.evidenceClass === 'LOCAL').every((r) => r.status === 'PASS');
const livePass = results.filter((r) => r.evidenceClass === 'STAGING_LIVE').every((r) => r.status === 'PASS');
const hardFails = results.filter((r) => r.status === 'FAIL');
const blockers = results.filter((r) => r.status === 'BLOCKED_BY_ENVIRONMENT');
const legalStatus = 'HUMAN_ATTESTATION_REQUIRED';
const gate = localPass && livePass && hardFails.length === 0 && legalStatus !== 'HUMAN_ATTESTATION_REQUIRED' ? 'CONDITIONAL_GO_CANDIDATE' : 'CANNOT_APPROVE';
const score = livePass ? '78-84/100 pending legal/provider attestation' : '65-70/100 local-only rescue estimate; official GA score requires staging evidence';
const runtimeReason = livePass
  ? 'Runtime evidence passed for the configured execution context. Official GA approval still requires hosted provider evidence and legal/commercial human attestation.'
  : 'Score cannot be final while applicable P0 runtime controls remain `MISSING_EVIDENCE` or `BLOCKED_BY_ENVIRONMENT`.';
const movementRuntime = livePass
  ? '- Runtime proof: passed for the configured execution context.\n- Remaining proof: hosted provider evidence and legal/commercial human approval.'
  : '- Runtime proof: still missing until staging/live env is available.';

const resultRows = [
  ['Command', 'Class', 'Result', 'Exit', 'Notes'],
  ['---', '---', '---', '---', '---'],
  ...results.map((r) => [`\`${r.command}\``, r.evidenceClass, r.status, String(r.exitCode ?? 'null'), r.notes]),
];

write('24_ga_unblock_evidence_pack.md', `
# GA Unblock Evidence Pack

Generated: \`${now}\`

Gate decision: \`${gate}\`

Score movement: \`${score}\`

Evidence context: \`${evidenceContext}\`

Set \`GATEFORGE_EVIDENCE_CONTEXT\` to describe the run environment, for example \`DISPOSABLE_LOCAL_STAGING_POSTGRES\`, \`HOSTED_STAGING\`, or \`PRODUCTION_READ_ONLY\`.

## Environment Inputs

Present env count: \`${envStatus.length - missingEnv.length}/${envStatus.length}\`

Missing env names, values redacted/not printed:

${missingEnv.map((e) => `- \`${e}\``).join('\n') || '- None'}

## Command Evidence

${table(resultRows)}

## Evidence Logs

Sanitized logs are under \`gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/\`.
`);

write('25_live_command_results.md', `
# Live Command Results

Generated: \`${now}\`

${table([
  ['Command', 'Result', 'Evidence Meaning'],
  ['---', '---', '---'],
  ...results.filter((r) => r.evidenceClass === 'STAGING_LIVE').map((r) => [`\`${r.command}\``, r.status, r.status === 'PASS' ? 'Runtime evidence accepted.' : 'Runtime evidence not closed.']),
])}

## Sanitized Excerpts

${results.filter((r) => r.evidenceClass === 'STAGING_LIVE').map((r) => `### ${r.name}\n\n\`\`\`text\n${r.outputExcerpt || '(no output)'}\n\`\`\``).join('\n\n')}
`);

write('26_remaining_blockers.md', `
# Remaining GA Blockers

Generated: \`${now}\`

## P0 Runtime Blockers

${blockers.map((r) => `- \`${r.name}\`: ${r.notes}`).join('\n') || '- None'}

## P0 Hard Failures

${hardFails.map((r) => `- \`${r.name}\`: see sanitized log \`ga-unblock-evidence/${r.name}.log\``).join('\n') || '- None'}

## Human Attestation

- Legal/commercial final approval: \`${legalStatus}\`

## Required Next Inputs

${missingEnv.map((e) => `- \`${e}\``).join('\n') || '- No missing environment inputs detected.'}
`);

write('27_recomputed_score.md', `
# Recomputed GateForge Score

Generated: \`${now}\`

Baseline: \`54/100\` if using the user's stricter commercial-readiness baseline, or \`74/100\` if using the earlier GateForge technical audit baseline.

Current rescue estimate: \`${score}\`

Official GA score: \`NOT_FINAL\`

Reason: ${runtimeReason}

## Movement

- Local rescue controls: materially improved.
${movementRuntime}
- Gate rule: any open applicable P0 blocks GA, regardless of score.
`);

write('28_conditional_go_request.md', `
# Conditional GO Request

Generated: \`${now}\`

Requested decision: \`${livePass && hardFails.length === 0 ? 'CONDITIONAL_GO_CANDIDATE_PENDING_HUMAN_AND_HOSTED_PROVIDER_ATTESTATION' : 'DO_NOT_APPROVE_YET'}\`

## Conditions To Approve

1. \`npm run test:pg\` passes against staging Postgres.
2. \`npm run ci:live\` passes and artifact is archived.
3. \`npm run deploy:health-gate\` passes against staging app/runtime providers.
4. Backup/restore drill passes against disposable restore database.
5. Admin MFA setup/verify proof is archived.
6. AI budget allowed/blocked/kill-switch evidence is archived.
7. Signed webhook duplicate and stale replay evidence is archived.
8. Monitoring and alerting proof is archived.
9. Legal pack receives explicit human approval.

## Current Answer

\`${gate}\`

## Why Not Full GO Yet

${livePass ? 'The configured runtime checks passed. Full GA still needs hosted provider evidence and explicit legal/commercial human approval.' : 'The runtime checks did not all pass, so Conditional GO cannot be requested yet.'}
`);

const summary = {
  generatedAt: now,
  evidenceContext,
  gate,
  score,
  env: envStatus,
  results: results.map((r) => ({
    name: r.name,
    command: r.command,
    status: r.status,
    exitCode: r.exitCode,
    evidenceClass: r.evidenceClass,
    notes: r.notes,
    log: `ga-unblock-evidence/${r.name}.log`,
  })),
};
fs.writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log(`GateForge GA unblock run: ${gate}`);
console.log(`Score estimate: ${score}`);
console.log(`Artifacts written under ${runDir}`);
for (const r of results) console.log(`  ${r.status.padEnd(24)} ${r.name}`);

process.exit(gate === 'CANNOT_APPROVE' ? 1 : 0);
