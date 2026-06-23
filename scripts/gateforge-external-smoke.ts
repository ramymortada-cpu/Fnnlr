#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

type SmokeCase = {
  name: string;
  args: string[];
  expectExit: 0 | 1;
  expectedText: string;
};

const cases: SmokeCase[] = [
  {
    name: 'complete packet passes',
    args: ['scripts/gateforge-external-check.ts', 'tests/fixtures/gateforge-external-pass.json'],
    expectExit: 0,
    expectedText: 'GateForge external evidence: PASS',
  },
  {
    name: 'template with missing evidence fails closed',
    args: ['scripts/gateforge-external-check.ts', 'gateforge-audit/external-attestations/hosted-staging-attestation.template.json'],
    expectExit: 1,
    expectedText: 'hosted_staging_gateforge_run: status is MISSING, expected PASS',
  },
];

for (const c of cases) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...c.args], { encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== c.expectExit) {
    console.error(`GateForge external smoke failed: ${c.name}`);
    console.error(`expected exit ${c.expectExit}, got ${result.status}`);
    console.error(output);
    process.exit(1);
  }
  if (!output.includes(c.expectedText)) {
    console.error(`GateForge external smoke failed: ${c.name}`);
    console.error(`missing expected text: ${c.expectedText}`);
    console.error(output);
    process.exit(1);
  }
  console.log(`PASS ${c.name}`);
}

console.log('GateForge external smoke: PASS');
