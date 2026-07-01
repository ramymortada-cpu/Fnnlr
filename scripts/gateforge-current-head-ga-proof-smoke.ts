#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message: string, output = ''): never {
  console.error(`GateForge current-head GA evidence proof smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-current-head-ga-proof.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

const passFixture = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pass.json');
const pendingFixture = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pending.json');
const failFixture = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-fail.json');
const passOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pass.md');
const passJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pass-output.json');
const pendingOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pending.md');
const pendingJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-pending-output.json');
const failOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-fail.md');
const failJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-current-head-ga-proof-fail-output.json');

fs.writeFileSync(
  passFixture,
  JSON.stringify(
    [
      {
        databaseId: 1001,
        status: 'completed',
        conclusion: 'success',
        headSha: 'abc123',
        url: 'https://github.com/example/repo/actions/runs/1001',
      },
    ],
    null,
    2,
  ),
);
fs.writeFileSync(
  pendingFixture,
  JSON.stringify(
    [
      {
        databaseId: 1002,
        status: 'in_progress',
        conclusion: '',
        headSha: 'abc123',
        url: 'https://github.com/example/repo/actions/runs/1002',
      },
    ],
    null,
    2,
  ),
);
fs.writeFileSync(
  failFixture,
  JSON.stringify(
    [
      {
        databaseId: 1003,
        status: 'completed',
        conclusion: 'failure',
        headSha: 'abc123',
        url: 'https://github.com/example/repo/actions/runs/1003',
      },
    ],
    null,
    2,
  ),
);

const passing = run(['--from-file', passFixture, '--head-sha', 'abc123', '--out', passOut, '--json-out', passJsonOut]);
if (passing.status !== 0) fail('passing fixture did not pass', passing.output);
const passJson = JSON.parse(fs.readFileSync(passJsonOut, 'utf8')) as { decision?: string; successfulRun?: unknown };
if (passJson.decision !== 'PASS') fail('passing JSON did not include PASS decision');
if (!passJson.successfulRun) fail('passing JSON did not include successfulRun');

const pending = run([
  '--from-file',
  pendingFixture,
  '--head-sha',
  'abc123',
  '--out',
  pendingOut,
  '--json-out',
  pendingJsonOut,
  '--allow-not-ready',
]);
if (pending.status !== 0) fail('pending fixture should pass with allow-not-ready', pending.output);
const pendingJson = JSON.parse(fs.readFileSync(pendingJsonOut, 'utf8')) as { decision?: string; inProgressRun?: unknown };
if (pendingJson.decision !== 'IN_PROGRESS') fail('pending JSON did not include IN_PROGRESS decision');
if (!pendingJson.inProgressRun) fail('pending JSON did not include inProgressRun');

const failing = run(['--from-file', failFixture, '--head-sha', 'abc123', '--out', failOut, '--json-out', failJsonOut]);
if (failing.status === 0) fail('failing fixture unexpectedly passed', failing.output);
const failReport = fs.readFileSync(failOut, 'utf8');
const failJson = JSON.parse(fs.readFileSync(failJsonOut, 'utf8')) as { decision?: string; blockers?: string[] };
if (!failReport.includes('Decision: `NOT_READY`')) fail('failing report did not include NOT_READY decision');
if (failJson.decision !== 'NOT_READY') fail('failing JSON did not include NOT_READY decision');
if (!failJson.blockers?.includes('NO_SUCCESSFUL_COMPLETED_GA_EVIDENCE_RUN_FOR_CURRENT_HEAD')) {
  fail('failing JSON did not include missing-success blocker');
}
if (failReport.includes('postgres://') || failReport.includes('sk-')) fail('report leaked secret-like values');

console.log('GateForge current-head GA evidence proof smoke: PASS');
