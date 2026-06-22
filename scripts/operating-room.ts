#!/usr/bin/env tsx
import { dailyCheck, customerStatus, week1Review, triage, type TriageIssue } from '../modules/operating-room/src/service.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * customer operating-room CLI.
 *   customer:daily-check  <tenantId> <funnelId>
 *   customer:triage       <tenantId> <funnelId> <issueType> [connectionId]
 *   customer:status       <tenantId> <funnelId>
 *   customer:week1-review  <tenantId> <funnelId>
 * Every command prints a clear status/decision and never prints secrets.
 */

const cmd = process.argv[2];
const [tenantId, funnelId] = [process.argv[3], process.argv[4]];

function need() { if (!tenantId || !funnelId) { console.error('Need <tenantId> <funnelId>'); process.exit(2); } }

async function main(): Promise<number> {
  if (cmd === 'daily-check') {
    need();
    const d = await dailyCheck(tenantId, funnelId);
    console.log(`STATUS: ${d.status}`);
    console.log(`  activation: ${d.activationStage ?? '-'} (${d.readinessScore ?? 0}%)`);
    console.log(`  signals 24h: views=${d.signals24h.pageViews} clicks=${d.signals24h.whatsappClicks} leads=${d.signals24h.leads} paymentStates=${d.signals24h.paymentStates}`);
    console.log(`  desk top: ${d.revenueDeskTop ?? '-'} | recs=${d.recommendations} outcomes=${d.outcomesMeasured}`);
    if (d.incidents.length) { console.log('  incidents:'); d.incidents.forEach((i) => console.log(`    [${i.severity}] ${i.code}: ${i.reason}`)); }
    console.log(`  decision: ${d.decision.decision} (${d.decision.confidence})`);
    console.log(`  next: ${d.nextAction}`);
    return d.status === 'BLOCKED' ? 1 : 0;
  }
  if (cmd === 'triage') {
    need();
    const issue = process.argv[5] as TriageIssue;
    if (!issue) { console.error('Need an issue type'); return 2; }
    const t = await triage(tenantId, funnelId, issue, { connectionId: process.argv[6] });
    t.checks.forEach((c) => console.log(`  · ${c.name}: ${c.result}`));
    console.log(`  probable cause: ${t.probableCause}`);
    console.log(`  safe next action: ${t.safeNextAction}`);
    console.log(`  manual DB edit: ${t.manualDbEdit}`);
    return 0;
  }
  if (cmd === 'status') {
    need();
    const s = await customerStatus(tenantId, funnelId);
    console.log(JSON.stringify(s, null, 2));
    return 0;
  }
  if (cmd === 'week1-review') {
    need();
    const w = await week1Review(tenantId, funnelId);
    console.log(JSON.stringify(w, null, 2));
    console.log(`DECISION: ${w.decision.decision}`);
    return 0;
  }
  console.error('Commands: daily-check | triage | status | week1-review  <tenantId> <funnelId> [...]');
  return 2;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
