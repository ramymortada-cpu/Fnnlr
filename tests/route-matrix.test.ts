import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_AUTH_MATRIX, routeMatrixSummary } from '../modules/security/src/route-matrix.js';

test('route authorization matrix has classifications and negative evidence for every row', () => {
  assert.ok(ROUTE_AUTH_MATRIX.length >= 40);
  const seen = new Set<string>();
  for (const row of ROUTE_AUTH_MATRIX) {
    assert.ok(row.method);
    assert.ok(row.pattern.startsWith('/'));
    assert.match(row.auth, /^(public|authenticated|admin|internal_cron|webhook)$/);
    assert.ok(row.negativeTest.length > 10, `${row.pattern} must name a negative test/evidence`);
    const key = `${row.method} ${row.pattern}`;
    assert.equal(seen.has(key), false, `duplicate route matrix row: ${key}`);
    seen.add(key);
  }
});

test('route authorization matrix keeps privileged surfaces explicit', () => {
  const summary = routeMatrixSummary();
  assert.ok(summary.admin >= 2, 'ops/admin routes are admin-classified');
  assert.ok(summary.webhook >= 3, 'webhook routes are not mixed into authenticated routes');
  assert.ok(summary.internal_cron >= 1, 'internal cron has a distinct secret-auth class');
  assert.ok(ROUTE_AUTH_MATRIX.some((r) => r.pattern === '/auth/mfa/setup'));
  assert.ok(ROUTE_AUTH_MATRIX.some((r) => r.pattern === '/auth/mfa/verify'));
});
