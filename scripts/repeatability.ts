#!/usr/bin/env tsx
import fs from 'node:fs';
import { repeatabilityCheck, repeatabilityReport } from '../modules/repeatability/src/runner.js';
import type { CustomerConfig } from '../modules/customer-zero/src/config.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * customer repeatability CLI — proves a second customer runs through the same path.
 *   customer:repeatability-check  <configA.json> <configB.json> [pwA] [pwB]
 *   customer:repeatability-report <configA.json> <configB.json> [pwA] [pwB]
 * No secrets, no demo data, no DB hacking — uses the real setup runner.
 */

const cmd = process.argv[2];
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as CustomerConfig;

async function main(): Promise<number> {
  if (cmd !== 'check' && cmd !== 'report') {
    console.error('Commands: check <a.json> <b.json> [pwA] [pwB] | report <a.json> <b.json> [pwA] [pwB]');
    return 2;
  }
  const a = read(process.argv[3]); const b = read(process.argv[4]);
  const pwA = process.argv[5] || 'TempPassA!23456'; const pwB = process.argv[6] || 'TempPassB!23456';
  const r = await repeatabilityCheck({ label: 'customerA', config: a, ownerPassword: pwA }, { label: 'customerB', config: b, ownerPassword: pwB });

  if (cmd === 'report') {
    console.log(JSON.stringify(repeatabilityReport(r), null, 2));
    return r.status === 'PASS' ? 0 : 1;
  }

  console.log(`REPEATABILITY: ${r.status}`);
  console.log('  customers:'); r.customers.forEach((c) => console.log(`    · ${c.label}: tenant=${c.tenantId.slice(0, 8)} business=${c.businessId.slice(0, 8)} funnel=${c.funnelId.slice(0, 8)}`));
  console.log('  separation:'); r.separation.forEach((c) => console.log(`    ${c.ok ? '✓' : '✗'} ${c.check}`));
  console.log('  idempotency:'); r.idempotency.forEach((c) => console.log(`    ${c.ok ? '✓' : '✗'} ${c.check}`));
  console.log('  signal isolation:'); r.signalIsolation.forEach((c) => console.log(`    ${c.ok ? '✓' : '✗'} ${c.check}`));
  if (r.blockers.length) { console.log('  blockers:'); r.blockers.forEach((bk) => console.log(`    ✗ ${bk}`)); }
  console.log(`  next: ${r.nextAction}`);
  return r.status === 'PASS' ? 0 : 1;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
