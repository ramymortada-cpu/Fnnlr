#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const partialPacketPath = path.join(os.tmpdir(), 'fnnlr-gateforge-external-partial-pass.json');
const partialPacket = JSON.parse(fs.readFileSync('tests/fixtures/gateforge-external-pass.json', 'utf8')) as {
  items: { id: string; blockerIdsClosed?: string[] }[];
};
const aiItem = partialPacket.items.find((item) => item.id === 'ai_budget_runtime_proof');
if (!aiItem) {
  console.error('GateForge external smoke failed: missing ai_budget_runtime_proof fixture item');
  process.exit(1);
}
aiItem.blockerIdsClosed = [];
fs.writeFileSync(partialPacketPath, `${JSON.stringify(partialPacket, null, 2)}\n`);
cases.push({
  name: 'PASS packet without every GF blocker mapping fails',
  args: ['scripts/gateforge-external-check.ts', partialPacketPath],
  expectExit: 1,
  expectedText: 'GF-016: missing explicit PASS blocker closure mapping',
});

const weakRunUrlPacketPath = path.join(os.tmpdir(), 'fnnlr-gateforge-external-weak-run-url.json');
const weakRunUrlPacket = JSON.parse(fs.readFileSync('tests/fixtures/gateforge-external-pass.json', 'utf8')) as {
  items: { id: string; evidenceRefs?: string[] }[];
};
const hostedRunItem = weakRunUrlPacket.items.find((item) => item.id === 'hosted_staging_gateforge_run');
if (!hostedRunItem) {
  console.error('GateForge external smoke failed: missing hosted_staging_gateforge_run fixture item');
  process.exit(1);
}
hostedRunItem.evidenceRefs = ['https://github.com/ramymortada-cpu/Fnnlr/actions/runs/example', 'artifact:hosted-staging-ga-evidence-summary'];
fs.writeFileSync(weakRunUrlPacketPath, `${JSON.stringify(weakRunUrlPacket, null, 2)}\n`);
cases.push({
  name: 'PASS packet with non-numeric GitHub run evidence fails',
  args: ['scripts/gateforge-external-check.ts', weakRunUrlPacketPath],
  expectExit: 1,
  expectedText: 'hosted_staging_gateforge_run: missing required evidence ref pattern',
});

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
