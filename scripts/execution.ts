#!/usr/bin/env tsx
import fs from 'node:fs';
import { validateExecutionManifest, safeManifestEcho, type ExecutionManifest } from '../modules/execution/src/manifest.js';
import { executionLock, launchCheck, firstSignal, launchSummary } from '../modules/execution/src/service.js';
import { logExecution } from '../modules/execution/src/log.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * customer execution CLI — the execution lock for Customer Zero.
 *   customer:execution-verify <manifest>
 *   customer:execution-lock   <manifest> <tenantId> <funnelId>
 *   customer:launch-check     <tenantId> <funnelId>
 *   customer:first-signal     <tenantId> <funnelId> [--real]
 *   customer:launch-summary   <manifest> <tenantId> <funnelId>
 * Every command prints a clear status and never prints secrets.
 */

const cmd = process.argv[2];
const isProd = process.env.NODE_ENV === 'production';
const readManifest = (p: string): ExecutionManifest => JSON.parse(fs.readFileSync(p, 'utf8'));

async function main(): Promise<number> {
  if (cmd === 'execution-verify') {
    const m = readManifest(process.argv[3]);
    const v = validateExecutionManifest(m, { production: isProd });
    console.log('Manifest:', JSON.stringify(safeManifestEcho(m)));
    v.issues.forEach((i) => console.log(`  ${i.level === 'fail' ? '✗' : '!'} ${i.field}: ${i.message}`));
    console.log(v.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    return v.ok ? 0 : 1;
  }
  if (cmd === 'execution-lock') {
    const m = readManifest(process.argv[3]);
    const [tenantId, funnelId] = [process.argv[4], process.argv[5]];
    if (!tenantId || !funnelId) { console.error('Need <manifest> <tenantId> <funnelId>'); return 2; }
    const lock = await executionLock(tenantId, funnelId, m, { production: isProd });
    console.log(`EXECUTION LOCK: ${lock.status}`);
    lock.checks.forEach((c) => console.log(`  ${c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✗'} ${c.message}`));
    console.log(`  decision: ${lock.decision}`);
    console.log(`  next: ${lock.nextAction}`);
    await logExecution(tenantId, 'cli', 'execution_lock_checked', { status: lock.status, decision: lock.decision }).catch(() => {});
    return lock.status === 'BLOCKED' ? 1 : 0;
  }
  if (cmd === 'launch-check') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); return 2; }
    const lc = await launchCheck(tenantId, funnelId);
    console.log(`LAUNCH CHECK: ${lc.status}`);
    for (const [section, items] of Object.entries(lc.sections)) {
      console.log(`  [${section}]`);
      items.forEach((c) => console.log(`    ${c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✗'} ${c.message}`));
    }
    await logExecution(tenantId, 'cli', 'execution_launch_checked', { status: lc.status }).catch(() => {});
    return lc.status === 'BLOCKED' ? 1 : 0;
  }
  if (cmd === 'first-signal') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    const real = process.argv.includes('--real');
    if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); return 2; }
    const r = await firstSignal(tenantId, funnelId, { scriptGenerated: !real });
    console.log(`FIRST SIGNAL: ${r.ok ? 'OK' : 'NOT SEEN'}`);
    console.log(`  marked test: ${r.marked}`);
    console.log(`  seen in: ${r.seenIn.join(', ') || '(none)'}`);
    console.log(`  ${r.note}`);
    await logExecution(tenantId, 'cli', 'execution_first_signal', { ok: r.ok, marked: r.marked, seenIn: r.seenIn }).catch(() => {});
    return r.ok ? 0 : 1;
  }
  if (cmd === 'launch-summary') {
    const m = readManifest(process.argv[3]);
    const [tenantId, funnelId] = [process.argv[4], process.argv[5]];
    if (!tenantId || !funnelId) { console.error('Need <manifest> <tenantId> <funnelId>'); return 2; }
    const s = await launchSummary(tenantId, funnelId, m);
    console.log(JSON.stringify(s, null, 2));
    return 0;
  }
  console.error('Commands: execution-verify <m> | execution-lock <m> <tid> <fid> | launch-check <tid> <fid> | first-signal <tid> <fid> [--real] | launch-summary <m> <tid> <fid>');
  return 2;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
