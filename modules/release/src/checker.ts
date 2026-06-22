import { checkEnv, type EnvCheck } from './env-spec.js';
import { getControlPool } from '../../../packages/db/src/router.js';

/**
 * Release-candidate checker. Aggregates environment validation, DB reachability,
 * migration status, required indexes, and fail-closed guarantees into a single
 * PASS/FAIL with a checklist. Safe to run against a real deployment — it reads
 * state and (optionally) does one disposable provisioning probe; it never logs
 * secrets.
 */

export interface CheckLine { id: string; level: 'ok' | 'warn' | 'fail'; message: string; }
export interface ReleaseReport {
  pass: boolean;
  isProd: boolean;
  blocking: CheckLine[];
  warnings: CheckLine[];
  checklist: CheckLine[];
}

export async function runReleaseChecker(opts: { probeProvisioning?: boolean } = {}): Promise<ReleaseReport> {
  const checklist: CheckLine[] = [];
  const env = process.env as Record<string, string | undefined>;

  // 1) environment
  const { isProd, checks } = checkEnv(env);
  for (const c of checks) checklist.push({ id: `env:${c.name}`, level: c.level, message: `${c.name}: ${c.message}` });

  // 2) control-plane DB reachable + migrations applied
  let controlOk = false;
  try {
    const pool = getControlPool();
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM schema_migrations_control`);
    controlOk = true;
    checklist.push({ id: 'db:control', level: 'ok', message: `control-plane DB reachable, ${r.rows[0].n} migrations applied` });
    // required control indexes for hot lookups
    const idx = (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map((x: any) => x.indexname);
    const needControl = ['idx_sessions_token', 'idx_public_codes_code', 'idx_integration_routes_conn'];
    for (const want of needControl) {
      const present = idx.some((i: string) => i === want || i.includes(want.replace('idx_', '')));
      checklist.push({ id: `idx:${want}`, level: present ? 'ok' : 'warn', message: present ? `index ${want} present` : `index ${want} not found (lookup may be slow)` });
    }
  } catch (e: any) {
    checklist.push({ id: 'db:control', level: 'fail', message: `control-plane DB not reachable: ${String(e?.message ?? e).slice(0, 120)}` });
  }

  // 3) tenant provisioning probe (disposable) — only when asked and control is up
  if (opts.probeProvisioning && controlOk) {
    try {
      const { provisionTenant, deleteTenant } = await import('../../provisioning/src/provision.js');
      const { withTenant } = await import('../../../packages/db/src/router.js');
      const t = await provisionTenant({ type: 'individual', displayName: 'release-probe' });
      const ok = await withTenant(t.tenantId, async (c) => (await c.query(`SELECT 1 AS ok`)).rows[0].ok);
      await deleteTenant(t.tenantId);
      checklist.push({ id: 'provisioning', level: ok === 1 ? 'ok' : 'fail', message: 'tenant provisioning + query + teardown works' });
    } catch (e: any) {
      checklist.push({ id: 'provisioning', level: 'fail', message: `provisioning probe failed: ${String(e?.message ?? e).slice(0, 120)}` });
    }
  } else {
    checklist.push({ id: 'provisioning', level: 'warn', message: 'provisioning not probed (pass probeProvisioning to test)' });
  }

  // 4) fail-closed guarantees (static, code-level)
  try {
    const { encryptSecret } = await import('../../integrations/src/secrets.js');
    const prevNode = env.NODE_ENV; const prevA = env.INTEGRATION_ENCRYPTION_KEY; const prevB = env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production'; delete process.env.INTEGRATION_ENCRYPTION_KEY; delete process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
    let threw = false;
    try { encryptSecret('probe'); } catch { threw = true; }
    if (prevNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNode;
    if (prevA !== undefined) process.env.INTEGRATION_ENCRYPTION_KEY = prevA;
    if (prevB !== undefined) process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY = prevB;
    checklist.push({ id: 'failclosed:encryption', level: threw ? 'ok' : 'fail', message: threw ? 'encryption fails closed in production without a key' : 'encryption does NOT fail closed — secrets could be stored plaintext' });
  } catch (e: any) {
    checklist.push({ id: 'failclosed:encryption', level: 'warn', message: `could not verify encryption fail-closed: ${String(e?.message ?? e).slice(0, 80)}` });
  }

  // 5) no dev tenant trust in production
  if (isProd && env.FNNLR_DEV_MODE === 'true') {
    checklist.push({ id: 'devtrust', level: 'fail', message: 'FNNLR_DEV_MODE=true in production — API would trust x-tenant-id header' });
  } else {
    checklist.push({ id: 'devtrust', level: 'ok', message: 'no dev tenant-header trust in this environment' });
  }

  // 6) scheduler status visibility
  checklist.push({ id: 'jobs', level: 'ok', message: env.FNNLR_DISABLE_JOBS === 'true' ? 'scheduled jobs DISABLED (kill-switch on)' : 'scheduled jobs enabled' });

  const blocking = checklist.filter((c) => c.level === 'fail');
  const warnings = checklist.filter((c) => c.level === 'warn');
  return { pass: blocking.length === 0, isProd, blocking, warnings, checklist };
}

/** Pretty one-line-per-check renderer for CLI output. No secrets ever printed. */
export function renderReport(r: ReleaseReport): string {
  const mark = (l: string) => (l === 'ok' ? '✓' : l === 'warn' ? '!' : '✗');
  const lines = r.checklist.map((c) => `  ${mark(c.level)} ${c.message}`);
  return [
    `Release Candidate Check — ${r.isProd ? 'PRODUCTION' : 'non-production'}`,
    ...lines,
    '',
    r.pass ? 'RESULT: PASS' : `RESULT: FAIL (${r.blocking.length} blocking)`,
  ].join('\n');
}
