#!/usr/bin/env tsx
import fs from 'node:fs';
import { goLive, monitor72h, eventLedger, update72h } from '../modules/execution/src/live.js';
import { listIssues } from '../modules/execution/src/issues.js';
import type { ExecutionManifest } from '../modules/execution/src/manifest.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * customer live-execution CLI.
 *   customer:go-live      <manifest> <tenantId> <funnelId> [--real]
 *   customer:72h-monitor  <tenantId> <funnelId>
 *   customer:72h-update   <manifest> <tenantId> <funnelId>
 *   customer:ledger       <tenantId> <funnelId>
 *   customer:issues       <tenantId> <funnelId>
 * No fake traffic/leads/revenue. Refuses to launch on a BLOCKED execution lock.
 */

const cmd = process.argv[2];
const isProd = process.env.NODE_ENV === 'production';
const readManifest = (p: string): ExecutionManifest => JSON.parse(fs.readFileSync(p, 'utf8'));

async function main(): Promise<number> {
  if (cmd === 'go-live') {
    const m = readManifest(process.argv[3]);
    const [tenantId, funnelId] = [process.argv[4], process.argv[5]];
    if (!tenantId || !funnelId) { console.error('Need <manifest> <tenantId> <funnelId>'); return 2; }
    const real = process.argv.includes('--real');
    const r = await goLive(tenantId, funnelId, m, { production: isProd, realEvent: real });
    console.log(`GO-LIVE: ${r.status}  (lock: ${r.lockStatus})`);
    r.steps.forEach((s) => console.log(`  ${s.status === 'ok' ? '✓' : s.status === 'skip' ? '·' : '✗'} ${s.name}: ${s.detail}`));
    if (r.firstSignal) console.log(`  first signal: ok=${r.firstSignal.ok} marked=${r.firstSignal.marked} seenIn=${r.firstSignal.seenIn.join(',')}`);
    if (r.blockers.length) { console.log('  blockers:'); r.blockers.forEach((b) => console.log(`    ✗ ${b}`)); }
    return r.status === 'LAUNCHED' ? 0 : 1;
  }
  if (cmd === '72h-monitor') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); return 2; }
    const m = await monitor72h(tenantId, funnelId);
    console.log(JSON.stringify(m, null, 2));
    return 0;
  }
  if (cmd === '72h-update') {
    const man = readManifest(process.argv[3]);
    const [tenantId, funnelId] = [process.argv[4], process.argv[5]];
    if (!tenantId || !funnelId) { console.error('Need <manifest> <tenantId> <funnelId>'); return 2; }
    const u = await update72h(tenantId, funnelId, man);
    console.log(JSON.stringify(u, null, 2));
    return 0;
  }
  if (cmd === 'ledger') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); return 2; }
    console.log(JSON.stringify(await eventLedger(tenantId, funnelId), null, 2));
    return 0;
  }
  if (cmd === 'issues') {
    const tenantId = process.argv[3];
    if (!tenantId) { console.error('Need <tenantId>'); return 2; }
    console.log(JSON.stringify(await listIssues(tenantId), null, 2));
    return 0;
  }
  if (cmd === 'support-pack') {
    const [tenantId, funnelId] = [process.argv[3], process.argv[4]];
    if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); return 2; }
    const { supportPack } = await import('../modules/execution/src/support-pack.js');
    console.log(JSON.stringify(await supportPack(tenantId, funnelId), null, 2));
    return 0;
  }
  console.error('Commands: go-live <m> <tid> <fid> [--real] | 72h-monitor <tid> <fid> | 72h-update <m> <tid> <fid> | ledger <tid> <fid> | issues <tid>');
  return 2;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
