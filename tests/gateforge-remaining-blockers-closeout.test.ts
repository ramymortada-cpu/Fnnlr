import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('remaining external blocker closeout covers GF-001..GF-016 without secret values', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fnnlr-gateforge-closeout-'));
  const out = path.join(tmp, 'closeout.md');
  const jsonOut = path.join(tmp, 'closeout.json');
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/gateforge-remaining-blockers-closeout.ts', '--out', out, '--json-out', jsonOut],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(fs.readFileSync(jsonOut, 'utf8')) as {
    count: number;
    dependencyGateCount: number;
    totalOpenP0Closeout: number;
    blockerIds: string[];
    dependencyGateIds: string[];
    blockers: Array<{ id: string; secrets: string[]; evidenceRequired: string[]; validationCommands: string[] }>;
    dependencyGates: Array<{ id: string; dependsOn: string[]; command: string; evidenceRequired: string[] }>;
    safety: { secretValuesPrinted: boolean; productionMutated: boolean; sourceDumpsIncluded: boolean };
  };
  const md = fs.readFileSync(out, 'utf8');

  assert.equal(json.count, 16);
  assert.equal(json.dependencyGateCount, 5);
  assert.equal(json.totalOpenP0Closeout, 21);
  assert.deepEqual(json.blockerIds, Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(json.dependencyGateIds, ['GF-017', 'GF-018', 'GF-019', 'GF-021', 'GF-022']);
  assert.ok(json.blockers.every((blocker) => blocker.secrets.length > 0));
  assert.ok(json.blockers.every((blocker) => blocker.evidenceRequired.length > 0));
  assert.ok(json.blockers.every((blocker) => blocker.validationCommands.length > 0));
  assert.ok(json.dependencyGates.every((gate) => gate.dependsOn.length > 0));
  assert.ok(json.dependencyGates.every((gate) => gate.command.length > 0));
  assert.ok(json.dependencyGates.every((gate) => gate.evidenceRequired.length > 0));
  assert.equal(json.safety.secretValuesPrinted, false);
  assert.equal(json.safety.productionMutated, false);
  assert.equal(json.safety.sourceDumpsIncluded, false);
  assert.match(md, /Do not paste secret values/);
  assert.match(md, /Total open P0 closeout path: `21`/);
  assert.match(md, /Dependency gate scope: `GF-017, GF-018, GF-019, GF-021, GF-022`/);
  assert.doesNotMatch(md, /postgres:\/\/USER:PASSWORD|REPLACE_WITH_|sk-ant|RESEND_API_KEY=/);
});
