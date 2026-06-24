#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : '/tmp/fnnlr-gateforge-secrets';
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/47_ga_unblock_status.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : `${runDir}/47_ga_unblock_status.json`;
const strictWorkflow = 'GateForge Hosted Staging Strict';
const gaWorkflow = 'GateForge GA Evidence';

type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
type SecretStatus = 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID';
type LocalSecretJson = {
  ok: boolean;
  attestationReady: number;
  attestationRequired: number;
  runtimeReady: number;
  runtimeRequired: number;
  attestationOptions: { name: string; status: SecretStatus; reason?: string }[];
  runtime: { name: string; status: SecretStatus; reason?: string }[];
};
type WorkflowRun = {
  databaseId?: number;
  status?: string;
  conclusion?: string;
  headSha?: string;
  url?: string;
};
type Probe = {
  status: CheckStatus;
  detail: string;
  url?: string;
};

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function probeLocalSecrets(): { probe: Probe; parsed?: LocalSecretJson; openRuntime: string[]; openAttestation: string[] } {
  const result = run('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir, '--json']);
  let parsed: LocalSecretJson | undefined;
  try {
    parsed = JSON.parse(result.output) as LocalSecretJson;
  } catch {
    return {
      probe: { status: 'FAIL', detail: 'local secret check could not produce machine-readable output' },
      openRuntime: [],
      openAttestation: [],
    };
  }
  const openRuntime = parsed.runtime.filter((entry) => entry.status !== 'READY').map((entry) => entry.name);
  const openAttestation = parsed.attestationOptions.filter((entry) => entry.status !== 'READY').map((entry) => entry.name);
  const attestationOk = parsed.attestationReady >= parsed.attestationRequired;
  const detail = parsed.ok
    ? `runtime ${parsed.runtimeReady}/${parsed.runtimeRequired}, attestation ${parsed.attestationReady}/${parsed.attestationRequired}`
    : `runtime ${parsed.runtimeReady}/${parsed.runtimeRequired}, attestation ${parsed.attestationReady}/${parsed.attestationRequired}; open runtime ${openRuntime.length}`;
  return {
    probe: { status: parsed.ok ? 'PASS' : 'FAIL', detail },
    parsed,
    openRuntime,
    openAttestation: attestationOk ? [] : openAttestation,
  };
}

function probeGithubSecrets(): Probe {
  const args = [
    'tsx',
    'scripts/gateforge-github-secrets-audit.ts',
    '--out',
    '/tmp/fnnlr-gateforge-unblock-status-gh.md',
    '--remediation-out',
    '/tmp/fnnlr-gateforge-unblock-status-gh-remediation.md',
  ];
  if (fromFile) {
    args.push('--from-file', fromFile);
  }
  const result = run('npx', args);
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    detail: result.status === 0 ? 'required GitHub secret names are present' : 'required GitHub secret names are missing',
  };
}

function probeAttestationPack(): Probe {
  const reportPath = `${runDir}/46_attestation_secret_pack.md`;
  if (!fs.existsSync(reportPath)) return { status: 'UNKNOWN', detail: 'attestation secret pack report is missing' };
  const report = fs.readFileSync(reportPath, 'utf8');
  if (report.includes('Decision: `READY`')) return { status: 'PASS', detail: 'attestation packet is ready for safe B64 packaging' };
  if (report.includes('Decision: `BLOCKED`')) return { status: 'FAIL', detail: 'attestation packet is blocked until real hosted evidence exists' };
  return { status: 'UNKNOWN', detail: 'attestation secret pack decision could not be parsed' };
}

function probeWorkflow(workflow: string): Probe {
  if (fromFile) return { status: 'UNKNOWN', detail: 'fixture mode does not inspect live workflow runs' };
  const result = run('gh', ['run', 'list', '--workflow', workflow, '--limit', '1', '--json', 'databaseId,status,conclusion,headSha,url']);
  if (result.status !== 0) return { status: 'UNKNOWN', detail: `could not inspect ${workflow}` };
  let latest: WorkflowRun | undefined;
  try {
    latest = (JSON.parse(result.output) as WorkflowRun[])[0];
  } catch {
    return { status: 'UNKNOWN', detail: `could not parse ${workflow} run list` };
  }
  if (!latest) return { status: 'UNKNOWN', detail: `no ${workflow} run found` };
  const pass = latest.status === 'completed' && latest.conclusion === 'success';
  return {
    status: pass ? 'PASS' : 'FAIL',
    detail: `${latest.databaseId ?? 'unknown'} ${latest.status ?? 'unknown'}/${latest.conclusion || 'none'} ${latest.headSha ?? ''}`.trim(),
    url: latest.url,
  };
}

function decisionFor(local: Probe, github: Probe, strict: Probe) {
  if (local.status !== 'PASS') {
    return {
      state: 'CANNOT_APPROVE_LOCAL_EVIDENCE',
      scoreBand: '65-70/100',
      nextAction: 'Replace local runtime secrets and create a valid hosted staging attestation packet, then run npm run gateforge:hosted-readiness-doctor.',
      rationale: 'Code controls are materially stronger, but GA evidence is still local/incomplete.',
    };
  }
  if (github.status !== 'PASS') {
    return {
      state: 'READY_TO_UPLOAD_GITHUB_SECRETS',
      scoreBand: '70-74/100',
      nextAction: 'Run npm run gateforge:hosted-unblock -- --apply --prepare-attestation after reviewing the local secret directory.',
      rationale: 'Local evidence is ready, but hosted workflow cannot prove it until GitHub Actions secrets exist.',
    };
  }
  if (strict.status !== 'PASS') {
    return {
      state: 'READY_TO_TRIGGER_HOSTED_STRICT',
      scoreBand: '74-78/100',
      nextAction: 'Run npm run gateforge:trigger-hosted-strict and wait for hosted evidence artifacts.',
      rationale: 'Secrets are present, but GA cannot move until hosted strict evidence passes.',
    };
  }
  return {
    state: 'READY_FOR_FINAL_GATE_REVIEW',
    scoreBand: '78-84/100',
    nextAction: 'Run npm run gateforge:final-gate && npm run gateforge:final-report, then review remaining human attestations.',
    rationale: 'Hosted evidence is present; final approval depends on final gate and human/legal attestations.',
  };
}

function mdList(values: string[]) {
  return values.length ? values.map((value) => `- \`${value}\``).join('\n') : '- None';
}

const localSecrets = probeLocalSecrets();
const githubSecrets = probeGithubSecrets();
const attestationPack = probeAttestationPack();
const strictRun = probeWorkflow(strictWorkflow);
const gaEvidenceRun = probeWorkflow(gaWorkflow);
const decision = decisionFor(localSecrets.probe, githubSecrets, strictRun);
const generatedAt = new Date().toISOString();

const json = {
  generatedAt,
  decision,
  probes: {
    localSecrets: localSecrets.probe,
    attestationPack,
    githubSecrets,
    hostedStrictWorkflow: strictRun,
    gaEvidenceWorkflow: gaEvidenceRun,
  },
  blockers: {
    openRuntimeSecrets: localSecrets.openRuntime,
    openAttestationSecrets: localSecrets.openAttestation,
  },
  safety: {
    secretValuesPrinted: false,
    productionMutated: false,
    sourceCodeFixesAppliedByThisCommand: false,
  },
};

const body = `# GateForge GA Unblock Status

Generated: \`${generatedAt}\`

This status file is the single operator dashboard for the GA unblock path. It contains secret names and readiness states only; no secret values are printed.

## Decision

- Gate state: \`${decision.state}\`
- Defensible score band: \`${decision.scoreBand}\`
- Next action: ${decision.nextAction}
- Rationale: ${decision.rationale}

## Probe Summary

| Probe | Status | Detail |
| --- | --- | --- |
| Local secret values | \`${localSecrets.probe.status}\` | ${localSecrets.probe.detail} |
| Attestation secret pack | \`${attestationPack.status}\` | ${attestationPack.detail} |
| GitHub Actions secret names | \`${githubSecrets.status}\` | ${githubSecrets.detail} |
| Hosted strict workflow | \`${strictRun.status}\` | ${strictRun.detail}${strictRun.url ? ` (${strictRun.url})` : ''} |
| GA evidence workflow | \`${gaEvidenceRun.status}\` | ${gaEvidenceRun.detail}${gaEvidenceRun.url ? ` (${gaEvidenceRun.url})` : ''} |

## Open Runtime Secret Names

${mdList(localSecrets.openRuntime)}

## Open Attestation Requirement

${mdList(localSecrets.openAttestation)}

## Score Translation

- \`65-70/100\`: local controls improved, but local/staging evidence is incomplete.
- \`70-74/100\`: local evidence ready, GitHub Actions secrets still not uploaded.
- \`74-78/100\`: hosted secrets ready, hosted strict run still not passing.
- \`78-84/100\`: hosted strict evidence passed; final gate and human attestations decide Conditional GO.

## Safety Guarantees

- Secret values printed: \`NO\`
- Production mutated: \`NO\`
- Source fixes applied by this command: \`NO\`
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
fs.writeFileSync(jsonOutPath, `${JSON.stringify(json, null, 2)}\n`);

console.log(`GateForge GA unblock status: ${decision.state}`);
console.log(`  score band: ${decision.scoreBand}`);
console.log(`  next: ${decision.nextAction}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);

if (decision.state !== 'READY_FOR_FINAL_GATE_REVIEW') process.exit(1);
