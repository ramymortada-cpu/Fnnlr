#!/usr/bin/env tsx
import fs from 'node:fs';
import { validateCustomerConfig, safeConfigEcho, type CustomerConfig } from '../modules/customer-zero/src/config.js';
import { setupCustomerFromConfig } from '../modules/customer-zero/src/setup.js';
import { smokeCustomer } from '../modules/customer-zero/src/smoke.js';
import { customerSnapshot, releaseDecision } from '../modules/customer-zero/src/support.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * customer-zero — the deployment command pack.
 *   deploy:check                       → release go/no-go
 *   customer:create <config> <pass>    → idempotent setup from config
 *   customer:verify <config>           → validate config only
 *   customer:smoke <tenantId> <funnel> → end-to-end smoke (test-marked)
 *   ops:customer <tenantId> <funnel>   → support snapshot
 * Every command prints PASS/FAIL and a next action; never prints secrets.
 */

const cmd = process.argv[2];
const isProd = process.env.NODE_ENV === 'production';

function readConfig(path: string): CustomerConfig {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function main() {
  if (cmd === 'deploy:check') {
    const d = await releaseDecision({});
    console.log(`DECISION: ${d.decision}`);
    if (d.blocking.length) { console.log('Blocking:'); d.blocking.forEach((b) => console.log(`  ✗ ${b}`)); }
    if (d.warnings.length) { console.log('Warnings:'); d.warnings.forEach((w) => console.log(`  ! ${w}`)); }
    if (d.manualSteps.length) { console.log('Manual steps:'); d.manualSteps.forEach((m) => console.log(`  • ${m}`)); }
    console.log(`Next: ${d.nextAction}`);
    return d.decision === 'READY_FOR_CUSTOMER_ZERO' ? 0 : 1;
  }

  if (cmd === 'customer:verify') {
    const cfg = readConfig(process.argv[3]);
    const v = validateCustomerConfig(cfg, { production: isProd });
    console.log('Config:', JSON.stringify(safeConfigEcho(cfg)));
    v.issues.forEach((i) => console.log(`  ${i.level === 'fail' ? '✗' : '!'} ${i.field}: ${i.message}`));
    console.log(v.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    return v.ok ? 0 : 1;
  }

  if (cmd === 'customer:create') {
    const cfg = readConfig(process.argv[3]);
    const password = process.argv[4];
    if (!password) { console.error('Usage: customer:create <config> <ownerPassword>'); return 2; }
    const r = await setupCustomerFromConfig(cfg, password, { production: isProd });
    if (!r.ok) { console.log('RESULT: FAIL'); r.blocking.forEach((b) => console.log(`  ✗ ${b}`)); return 1; }
    console.log('RESULT: PASS');
    console.log(`  tenantId=${r.tenantId}`);
    console.log(`  businessId=${r.businessId}`);
    console.log(`  funnelId=${r.funnelId}`);
    console.log(`  created: ${Object.entries(r.created).filter(([, v]) => v).map(([k]) => k).join(', ') || '(all reused — idempotent)'}`);
    console.log(`  next: ${r.nextAction ?? 'open Go Live'}`);
    return 0;
  }

  if (cmd === 'customer:smoke') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Usage: customer:smoke <tenantId> <funnelId>'); return 2; }
    const r = await smokeCustomer(tenantId, funnelId);
    r.steps.forEach((s) => console.log(`  ${s.status === 'ok' ? '✓' : s.status === 'skip' ? '·' : '✗'} ${s.name}: ${s.detail}`));
    console.log(r.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    return r.ok ? 0 : 1;
  }

  if (cmd === 'ops:customer') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Usage: ops:customer <tenantId> <funnelId>'); return 2; }
    const snap = await customerSnapshot(tenantId, funnelId);
    console.log(JSON.stringify(snap, null, 2));
    return 0;
  }

  console.error('Commands: deploy:check | customer:verify <cfg> | customer:create <cfg> <pass> | customer:smoke <tid> <fid> | ops:customer <tid> <fid>');
  return 2;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
