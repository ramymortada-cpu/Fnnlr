#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(message: string, output = ''): never {
  console.error(`GateForge GA evidence run audit smoke: FAIL - ${message}`);
  if (output) console.error(output);
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-ga-evidence-run-audit.ts', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

const passFixture = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-pass.json');
const failFixture = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-fail.json');
const passOut = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-pass.md');
const passJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-pass-output.json');
const failOut = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-fail.md');
const failJsonOut = path.join(os.tmpdir(), 'fnnlr-gateforge-ga-evidence-run-audit-fail-output.json');

fs.writeFileSync(
  passFixture,
  JSON.stringify(
    {
      run: {
        databaseId: 123,
        status: 'completed',
        conclusion: 'success',
        headSha: 'abc123',
        url: 'https://github.com/example/repo/actions/runs/123',
      },
      annotations: [
        {
          annotation_level: 'notice',
          message: 'Local evidence remains blocked until hosted staging evidence exists.',
          path: '.github',
          start_line: 25,
        },
      ],
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  failFixture,
  JSON.stringify(
    {
      run: {
        databaseId: 456,
        status: 'completed',
        conclusion: 'success',
        headSha: 'def456',
        url: 'https://github.com/example/repo/actions/runs/456',
      },
      annotations: [
        {
          annotation_level: 'failure',
          message: 'Process completed with exit code 1.',
          path: '.github',
          start_line: 25,
        },
      ],
    },
    null,
    2,
  ),
);

const passing = run(['--from-file', passFixture, '--out', passOut, '--json-out', passJsonOut]);
if (passing.status !== 0) fail('passing fixture did not pass', passing.output);
const passReport = fs.readFileSync(passOut, 'utf8');
const passJson = JSON.parse(fs.readFileSync(passJsonOut, 'utf8')) as { decision?: string; counts?: { failureAnnotations?: number } };
if (!passReport.includes('Audit decision: `PASS`')) fail('passing report did not include PASS decision');
if (passJson.decision !== 'PASS') fail('passing JSON did not include PASS decision');
if (passJson.counts?.failureAnnotations !== 0) fail('passing JSON did not count zero failure annotations');

const failing = run(['--from-file', failFixture, '--out', failOut, '--json-out', failJsonOut]);
if (failing.status === 0) fail('failing fixture unexpectedly passed', failing.output);
const failReport = fs.readFileSync(failOut, 'utf8');
const failJson = JSON.parse(fs.readFileSync(failJsonOut, 'utf8')) as { decision?: string; counts?: { failureAnnotations?: number } };
if (!failReport.includes('Audit decision: `FAIL`')) fail('failing report did not include FAIL decision');
if (!failReport.includes('Process completed with exit code 1.')) fail('failing report did not include failure annotation message');
if (failJson.decision !== 'FAIL') fail('failing JSON did not include FAIL decision');
if (failJson.counts?.failureAnnotations !== 1) fail('failing JSON did not count one failure annotation');
if (failReport.includes('postgres://') || failReport.includes('sk-')) fail('report leaked secret-like values');

console.log('GateForge GA evidence run audit smoke: PASS');
