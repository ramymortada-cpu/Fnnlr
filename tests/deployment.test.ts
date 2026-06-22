import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { renderEnvTemplate, requiredEnvNames, deployHealthGate, verifyRestore, CRITICAL_CONTROL_TABLES, CRITICAL_TENANT_TABLES } from '../modules/deployment/src/deploy.js';
import { planRollback, planNeverDropsTenantDb, ROLLBACK_PLAN } from '../modules/deployment/src/rollback.js';
import { checkEnv } from '../modules/release/src/env-spec.js';

/** Sprint 45 — production deployment lock. */

test('the production env template contains every required production var', () => {
  const tpl = renderEnvTemplate();
  for (const name of requiredEnvNames()) assert.ok(tpl.includes(name), `template missing ${name}`);
  assert.ok(tpl.includes('APP_BASE_URL') && tpl.includes('API_BASE_URL'));
});

test('the env template contains no real-looking secrets', () => {
  const tpl = renderEnvTemplate();
  assert.ok(!/sk-[a-z0-9]{10,}/i.test(tpl), 'no API-key-looking value');
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(tpl), 'no AWS-key-looking value');
  assert.ok(!/-----BEGIN/.test(tpl), 'no PEM block');
});

test('the dev-only var is commented out (never set) in the template', () => {
  const tpl = renderEnvTemplate();
  assert.ok(/# FNNLR_DEV_MODE=/.test(tpl), 'FNNLR_DEV_MODE must be commented out in production template');
});

test('release env check fails when the encryption key is missing in production', () => {
  const { checks } = checkEnv({ NODE_ENV: 'production', CONTROL_PLANE_DATABASE_URL: 'x', TENANT_DB_ADMIN_URL: 'x', TENANT_DB_HOST: 'h', FNNLR_CRON_SECRET: 's' });
  const enc = checks.find((c) => c.name === 'INTEGRATION_ENCRYPTION_KEY');
  assert.equal(enc?.level, 'fail');
});

test('restore verification catches missing tables', () => {
  const r = verifyRestore('control', ['tenants', 'users']); // missing workspaces, workspace_members
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('workspaces'));
});

test('restore verification passes when all critical tables present', () => {
  assert.equal(verifyRestore('control', CRITICAL_CONTROL_TABLES).ok, true);
  assert.equal(verifyRestore('tenant', CRITICAL_TENANT_TABLES).ok, true);
});

test('the default rollback plan is non-destructive and preserves the DB', () => {
  const d = planRollback({ reason: 'test' });
  assert.equal(d.includesDestructive, false);
  assert.ok(d.steps.every((s) => !s.destructive));
  assert.ok(d.steps.some((s) => s.action === 'preserve_db'));
});

test('a destructive restore is included only with explicit confirmation', () => {
  const d = planRollback({ reason: 'corruption', confirmDestructive: true });
  assert.equal(d.includesDestructive, true);
  assert.ok(d.steps.some((s) => s.destructive));
});

test('the rollback plan never drops a tenant database', () => {
  assert.equal(planNeverDropsTenantDb(), true);
  assert.ok(!ROLLBACK_PLAN.some((s) => /drop|truncate/i.test(s.action)));
});

test('deploy health gate is BLOCKED when the DB is unavailable, and prints no secrets', async () => {
  const prev = process.env.CONTROL_PLANE_DATABASE_URL;
  delete process.env.CONTROL_PLANE_DATABASE_URL;
  try {
    const g = await deployHealthGate();
    assert.equal(g.status, 'BLOCKED');
    // no leaked VALUES — connection strings, keys, PEM. ("cron secret present" is a
    // label, not a leak, so we don't match the bare word "secret".)
    const s = JSON.stringify(g);
    assert.ok(!/postgres(ql)?:\/\/\S/i.test(s), 'no connection string');
    assert.ok(!/sk-[a-z0-9]{10,}/i.test(s), 'no api key');
    assert.ok(!/-----BEGIN/.test(s), 'no PEM block');
  } finally { if (prev !== undefined) process.env.CONTROL_PLANE_DATABASE_URL = prev; }
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('deploy smoke: server starts, health ok, unsigned cron + unknown webhook rejected, bad public route safe', async () => {
  const server = createApiServer(); const port = await listen(server);
  const base = `http://localhost:${port}`;
  try {
    assert.ok((await fetch(`${base}/health`)).ok, 'health ok');
    const cron = await fetch(`${base}/internal/cron/fanout-daily`, { method: 'POST' });
    assert.ok(cron.status === 401 || cron.status === 403, 'unsigned cron rejected');
    const wh = await fetch(`${base}/webhooks/unknown-xyz`, { method: 'POST', body: '{}' });
    assert.ok(wh.status >= 400, 'unknown webhook rejected');
    const pub = await fetch(`${base}/p/does-not-exist-xyz`);
    assert.ok(pub.status >= 400 && pub.status < 500, 'bad public route fails safely');
  } finally { server.close(); }
});
