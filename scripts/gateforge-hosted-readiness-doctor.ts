#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/44_hosted_readiness_doctor.md`;
const replacementPacketPath = `${runDir}/45_secret_replacement_packet.md`;
const attestationPackPath = `${runDir}/46_attestation_secret_pack.md`;
const dirIndex = process.argv.indexOf('--dir');
const secretDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : '/tmp/fnnlr-gateforge-secrets';
const fromFileIndex = process.argv.indexOf('--from-file');
const fromFile = fromFileIndex >= 0 ? process.argv[fromFileIndex + 1] : '';
const workflow = 'GateForge Hosted Staging Strict';

type Probe = {
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  detail: string;
  output: string;
  localState?: 'READY' | 'MISSING_FILES' | 'PLACEHOLDERS' | 'EMPTY_FILES' | 'INVALID_FILES';
};

type LocalSecretJson = {
  ok: boolean;
  attestationOptions: { name: string; status: 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID' }[];
  runtime: { name: string; status: 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID' }[];
};

type LocalSecretProbe = Probe & {
  attestationReady?: boolean;
  runtimeReady?: boolean;
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

function probeLocalSecrets(): LocalSecretProbe {
  const result = run('npx', ['tsx', 'scripts/gateforge-local-secret-files-check.ts', '--dir', secretDir, '--json']);
  let localState: Probe['localState'] = 'MISSING_FILES';
  let attestationReady = false;
  let runtimeReady = false;
  try {
    const parsed = JSON.parse(result.output) as LocalSecretJson;
    const statuses = [...parsed.attestationOptions, ...parsed.runtime].map((entry) => entry.status);
    attestationReady = parsed.attestationOptions.some((entry) => entry.status === 'READY');
    runtimeReady = parsed.runtime.every((entry) => entry.status === 'READY');
    if (parsed.ok) localState = 'READY';
    else if (statuses.includes('PLACEHOLDER')) localState = 'PLACEHOLDERS';
    else if (statuses.includes('EMPTY')) localState = 'EMPTY_FILES';
    else if (statuses.includes('INVALID')) localState = 'INVALID_FILES';
    else localState = 'MISSING_FILES';
  } catch {
    localState = 'MISSING_FILES';
  }
  const detail =
    result.status === 0
      ? 'local secret files are ready'
      : localState === 'PLACEHOLDERS'
        ? 'local secret files exist but placeholders remain'
        : localState === 'EMPTY_FILES'
          ? 'local secret files contain empty values'
          : localState === 'INVALID_FILES'
            ? 'local secret files contain invalid values'
            : 'local secret files are missing';
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    detail,
    output: result.output,
    localState,
    attestationReady,
    runtimeReady,
  };
}

function probeAttestationPack(): Probe {
  if (!fs.existsSync(attestationPackPath)) {
    return {
      status: 'UNKNOWN',
      detail: 'attestation secret pack report has not been generated',
      output: `Run npm run gateforge:attestation-secret-pack.`,
    };
  }
  const report = fs.readFileSync(attestationPackPath, 'utf8');
  const ready = report.includes('Decision: `READY`');
  const blocked = report.includes('Decision: `BLOCKED`');
  return {
    status: ready ? 'PASS' : blocked ? 'FAIL' : 'UNKNOWN',
    detail: ready ? 'attestation packet can be encoded safely' : blocked ? 'attestation packet is not ready for B64 secret packaging' : 'could not determine attestation pack decision',
    output: `${attestationPackPath}\n${ready ? 'Decision=READY' : blocked ? 'Decision=BLOCKED' : 'Decision=UNKNOWN'}`,
  };
}

function probeGithubSecrets(): Probe {
  const args = ['tsx', 'scripts/gateforge-github-secrets-audit.ts'];
  if (fromFile) {
    args.push(
      '--from-file',
      fromFile,
      '--out',
      '/tmp/fnnlr-gateforge-doctor-gh-secrets.md',
      '--remediation-out',
      '/tmp/fnnlr-gateforge-doctor-remediation.md',
    );
  }
  const result = run('npx', args);
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    detail: result.status === 0 ? 'GitHub secret names are ready' : 'GitHub secret names are missing',
    output: result.output,
  };
}

function probeLatestStrictRun(): Probe {
  if (fromFile) {
    return {
      status: 'UNKNOWN',
      detail: 'skipped in fixture mode',
      output: 'Fixture mode does not inspect GitHub workflow runs.',
    };
  }
  const result = run('gh', ['run', 'list', '--workflow', workflow, '--limit', '1', '--json', 'databaseId,status,conclusion,headSha,url']);
  if (result.status !== 0) {
    return {
      status: 'UNKNOWN',
      detail: 'could not inspect hosted strict workflow runs',
      output: result.output,
    };
  }
  let parsed: { databaseId: number; status: string; conclusion: string; headSha: string; url: string }[] = [];
  try {
    parsed = JSON.parse(result.output);
  } catch {
    return { status: 'UNKNOWN', detail: 'could not parse workflow run list', output: result.output };
  }
  const latest = parsed[0];
  if (!latest) return { status: 'UNKNOWN', detail: 'no hosted strict workflow run found', output: result.output };
  const pass = latest.status === 'completed' && latest.conclusion === 'success';
  return {
    status: pass ? 'PASS' : 'FAIL',
    detail: `latest strict run ${latest.databaseId}: ${latest.status}/${latest.conclusion || 'none'}`,
    output: `${latest.url}\nheadSha=${latest.headSha}`,
  };
}

const localSecrets = probeLocalSecrets();
const attestationPack = probeAttestationPack();
const githubSecrets = probeGithubSecrets();
const strictRun = probeLatestStrictRun();
const decision =
  localSecrets.status !== 'PASS'
    ? localSecrets.localState === 'PLACEHOLDERS' || localSecrets.localState === 'EMPTY_FILES' || localSecrets.localState === 'INVALID_FILES'
      ? 'REPLACE_LOCAL_SECRET_PLACEHOLDERS'
      : 'SCAFFOLD_LOCAL_SECRET_FILES'
    : githubSecrets.status !== 'PASS'
      ? 'UPLOAD_GITHUB_SECRETS'
      : strictRun.status !== 'PASS'
        ? 'TRIGGER_HOSTED_STRICT'
        : 'REVIEW_HOSTED_STRICT_EVIDENCE';
const nextCommand =
  decision === 'SCAFFOLD_LOCAL_SECRET_FILES'
    ? 'npm run gateforge:scaffold-local-secrets'
    : decision === 'REPLACE_LOCAL_SECRET_PLACEHOLDERS'
      ? !localSecrets.attestationReady && localSecrets.runtimeReady
        ? 'npm run gateforge:attestation-secret-pack -- --write-b64, then rerun npm run gateforge:hosted-readiness-doctor.'
        : `npm run gateforge:secret-replacement-packet, then replace the listed local secret values and rerun npm run gateforge:hosted-readiness-doctor.`
    : decision === 'UPLOAD_GITHUB_SECRETS'
      ? 'npm run gateforge:hosted-unblock -- --apply'
      : decision === 'TRIGGER_HOSTED_STRICT'
        ? 'npm run gateforge:trigger-hosted-strict'
        : 'npm run gateforge:final-gate && npm run gateforge:final-report';

const now = new Date().toISOString();
const body = `# Hosted Readiness Doctor

Generated: \`${now}\`

This doctor checks readiness without printing secret values.

## Decision

- Status: \`${decision}\`
- Next command: \`${nextCommand}\`

## Probes

| Probe | Status | Detail |
| --- | --- | --- |
| Local secret files | \`${localSecrets.status}\` | ${localSecrets.detail} |
| Attestation secret pack | \`${attestationPack.status}\` | ${attestationPack.detail} |
| GitHub secret names | \`${githubSecrets.status}\` | ${githubSecrets.detail} |
| Hosted strict workflow | \`${strictRun.status}\` | ${strictRun.detail} |

## Notes

- Local secret directory: \`${secretDir}\`
- GitHub secrets source: \`${fromFile ? fromFile : 'gh secret list --json name'}\`
- Workflow: \`${workflow}\`
- Secret replacement packet: \`${replacementPacketPath}\`
- Attestation secret pack: \`${attestationPackPath}\`

## Sanitized Probe Output

### Local Secret Files

\`\`\`text
${localSecrets.output.trim() || '(no output)'}
\`\`\`

### GitHub Secret Names

\`\`\`text
${githubSecrets.output.trim() || '(no output)'}
\`\`\`

### Attestation Secret Pack

\`\`\`text
${attestationPack.output.trim() || '(no output)'}
\`\`\`

### Hosted Strict Workflow

\`\`\`text
${strictRun.output.trim() || '(no output)'}
\`\`\`
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);

console.log(`GateForge hosted readiness doctor: ${decision}`);
console.log(`  next: ${nextCommand}`);
console.log(`  wrote ${outPath}`);

if (decision !== 'REVIEW_HOSTED_STRICT_EVIDENCE') process.exit(1);
