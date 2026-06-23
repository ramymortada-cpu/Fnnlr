import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantExportEvidence } from '../modules/data-lifecycle/src/export.js';

test('tenant export evidence is sanitized and deterministic for the same inputs', () => {
  const a = buildTenantExportEvidence('tenant-a', [{ table: 'leads', rows: 2 }, { table: 'businesses', rows: 1 }], '2026-06-23T10:00:00.000Z');
  const b = buildTenantExportEvidence('tenant-a', [{ table: 'businesses', rows: 1 }, { table: 'leads', rows: 2 }], '2026-06-23T10:00:00.000Z');
  assert.deepEqual(a, b);
  assert.equal(a.tables[0].table, 'businesses');
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(a).includes('customer@example.com'), false);
});
