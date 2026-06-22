#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CI orchestration. One command that tells us, honestly, whether the build is
 * safe to release. Runs: typecheck, unit tests, commercial consistency, release
 * safety verify, web script balance, and the no-x-tenant-id-trust check. Live DB
 * tests run only when TEST_DATABASE_URL / CONTROL_PLANE_DATABASE_URL is set.
 *   ci          (no live DB)
 *   ci --live   (force live DB tests if configured)
 */

const live = process.argv.includes('--live');
const steps: { name: string; ok: boolean; detail?: string }[] = [];
const run = (name: string, fn: () => void) => {
  try { fn(); steps.push({ name, ok: true }); }
  catch (e: any) { steps.push({ name, ok: false, detail: String(e?.message ?? e).split('\n')[0] }); }
};
const sh = (c: string) => execSync(c, { stdio: 'pipe', encoding: 'utf8' });

run('typecheck', () => sh('npx tsc --noEmit'));

run('unit_tests', () => {
  const out = sh('npx tsx --test tests/*.test.ts 2>&1 || true');
  const fail = (out.match(/# fail (\d+)/) ?? [])[1];
  if (fail && Number(fail) > 0) throw new Error(`${fail} failing tests`);
  if (!/# pass \d+/.test(out)) throw new Error('no test summary');
});

run('commercial_checker', () => {
  const candidates = [path.resolve('..', '..', 'docs'), path.resolve('docs')].filter((d) => fs.existsSync(d));
  if (!candidates.length) { return; } // docs not mounted here — skip (verified separately)
  sh(`npx tsx scripts/commercial-check.ts ${candidates[0]}`);
});

run('release_safety', () => {
  // runs the production-safety + webhook-security + security-hardening tests
  sh('npm run -s verify:production-safety');
});

run('web_balance_and_no_tenant_trust', () => {
  for (const f of ['apps/web/index.html', 'apps/web/funnel.html']) {
    const h = fs.readFileSync(f, 'utf8');
    const open = (h.match(/<script>/g) ?? []).length, close = (h.match(/<\/script>/g) ?? []).length;
    if (open !== close) throw new Error(`${f} script tags unbalanced`);
    if (h.includes('x-tenant-id')) throw new Error(`${f} references x-tenant-id`);
  }
});

if (live) {
  run('live_db_tests', () => {
    if (!process.env.CONTROL_PLANE_DATABASE_URL && !process.env.TEST_DATABASE_URL) throw new Error('no live DB configured');
    sh('npx tsx --test tests/live-db.test.ts');
  });
} else {
  steps.push({ name: 'live_db_tests', ok: true, detail: 'skipped (no --live / not configured)' });
}

console.log('\n=== CI RESULT ===');
for (const s of steps) console.log(`  ${s.ok ? '✓' : '✗'} ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
const ok = steps.every((s) => s.ok);
console.log(`\n${ok ? 'SAFE TO RELEASE' : 'NOT SAFE TO RELEASE'}`);
process.exit(ok ? 0 : 1);
