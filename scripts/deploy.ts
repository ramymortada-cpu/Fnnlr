#!/usr/bin/env tsx
import fs from 'node:fs';
import http from 'node:http';
import { renderEnvTemplate, deployHealthGate, verifyRestore } from '../modules/deployment/src/deploy.js';
import { planRollback, ROLLBACK_PLAN } from '../modules/deployment/src/rollback.js';
import { closeAll } from '../packages/db/src/router.js';

/**
 * deploy CLI — production deployment lock.
 *   deploy:env-template [outPath]      write the production env template (no secrets)
 *   deploy:health-gate                  READY_TO_SERVE | DEGRADED | BLOCKED
 *   deploy:smoke                        start server + probe safe routes
 *   deploy:rollback-plan [--confirm]    print the (non-destructive by default) rollback plan
 *   deploy:verify-restore <control|tenant> <tables.json>
 */

const cmd = process.argv[2];

async function smoke(): Promise<number> {
  const { createApiServer } = await import('../apps/api/src/server.js');
  const server = createApiServer();
  const port: number = await new Promise((r) => server.listen(0, () => r((server.address() as any).port)));
  const base = `http://localhost:${port}`;
  const results: { check: string; ok: boolean }[] = [];
  const rec = (check: string, ok: boolean) => results.push({ check, ok });
  try {
    rec('server_starts', true);
    rec('health_ok', (await fetch(`${base}/health`)).ok);
    // unsigned cron must be rejected
    const cron = await fetch(`${base}/internal/cron/fanout-daily`, { method: 'POST' });
    rec('unsigned_cron_rejected', cron.status === 401 || cron.status === 403);
    // unknown webhook must be rejected (not 200)
    const wh = await fetch(`${base}/webhooks/unknown-xyz`, { method: 'POST', body: '{}' });
    rec('unknown_webhook_rejected', wh.status >= 400);
    // invalid public page fails safely (not 200, no crash)
    const pub = await fetch(`${base}/p/does-not-exist-xyz`);
    rec('invalid_public_route_safe', pub.status >= 400 && pub.status < 500);
  } finally { server.close(); }

  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.check}`);
  const ok = results.every((r) => r.ok);
  console.log(`DEPLOY SMOKE: ${ok ? 'PASS' : 'FAIL'}`);
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  if (cmd === 'env-template') {
    const out = process.argv[3];
    const tpl = renderEnvTemplate();
    if (out) { fs.writeFileSync(out, tpl); console.log(`wrote ${out}`); } else console.log(tpl);
    return 0;
  }
  if (cmd === 'health-gate') {
    const g = await deployHealthGate();
    console.log(`HEALTH GATE: ${g.status}`);
    g.checks.forEach((c) => console.log(`  ${c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✗'} ${c.message}`));
    return g.status === 'BLOCKED' ? 1 : 0;
  }
  if (cmd === 'smoke') return smoke();
  if (cmd === 'rollback-plan') {
    const confirm = process.argv.includes('--confirm');
    const d = planRollback({ reason: 'cli', confirmDestructive: confirm });
    console.log(d.note);
    d.steps.forEach((s) => console.log(`  ${s.order}. ${s.action}${s.destructive ? ' (destructive — explicit approval)' : ''}: ${s.detail}`));
    if (d.refusedDestructive) console.log('  (destructive restore omitted — pass --confirm only on confirmed data corruption)');
    return 0;
  }
  if (cmd === 'verify-restore') {
    const kind = process.argv[3] as 'control' | 'tenant';
    const tables = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
    const r = verifyRestore(kind, tables);
    console.log(`RESTORE VERIFY (${kind}): ${r.ok ? 'PASS' : 'FAIL'}`);
    if (r.missing.length) console.log(`  missing tables: ${r.missing.join(', ')}`);
    return r.ok ? 0 : 1;
  }
  console.error('Commands: env-template [out] | health-gate | smoke | rollback-plan [--confirm] | verify-restore <control|tenant> <tables.json>');
  return 2;
}

const code = await main();
await closeAll().catch(() => {});
process.exit(code);
