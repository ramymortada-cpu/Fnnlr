import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { computeChecklist, type ChecklistState } from '../modules/demo/src/checklist.js';

/**
 * Sprint 13 — pilot readiness. The checklist math is pure and tested here; the
 * full seed (which provisions a tenant DB) runs against Postgres in the live
 * suite. Public demo endpoints are surface-checked.
 */

function fullState(over: Partial<ChecklistState> = {}): ChecklistState {
  return {
    funnelCreated: true, offerCompleted: true, funnelMapReady: true, pageGenerated: true,
    pagePublished: true, trackedLinkCreated: true, paymentMethodsAdded: true, whatsappFlowGenerated: true,
    leadsReceiving: true, paymentStatesActive: true, leakDiagnosisRun: true, actionCenterPopulated: true,
    weeklyReportGenerated: true, commandBarReady: true, ...over,
  };
}

test('checklist: fully set up → 100% and no missing steps', () => {
  const r = computeChecklist(fullState());
  assert.equal(r.progress, 100);
  assert.equal(r.missing.length, 0);
  assert.equal(r.items.length, 14);
});

test('checklist: empty funnel → low progress and ordered missing steps with CTAs', () => {
  const r = computeChecklist(fullState({
    offerCompleted: false, pageGenerated: false, pagePublished: false, trackedLinkCreated: false,
    paymentMethodsAdded: false, whatsappFlowGenerated: false, leadsReceiving: false,
    paymentStatesActive: false, leakDiagnosisRun: false, actionCenterPopulated: false, weeklyReportGenerated: false,
  }));
  assert.ok(r.progress < 50);
  assert.ok(r.missing.length > 0);
  // every missing item has a CTA + target tab
  for (const m of r.missing) {
    assert.ok(m.cta.length > 0);
    assert.ok(m.targetTab.length > 0);
    assert.equal(m.done, false);
  }
});

test('checklist: progress is proportional', () => {
  const half = computeChecklist(fullState({
    pageGenerated: false, pagePublished: false, trackedLinkCreated: false, paymentMethodsAdded: false,
    whatsappFlowGenerated: false, leadsReceiving: false, paymentStatesActive: false,
  }));
  assert.equal(half.progress, 50);  // 7 of 14 done
});

// ---- public demo API surface ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}

test('demo credentials endpoint is public and reports existence', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/demo/credentials`);
    // Without a DB this may error, but it must not require auth (no 401).
    assert.notEqual(res.status, 401);
  } finally { server.close(); }
});

test('SECURITY: pilot checklist route rejects header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/funnels/j1/pilot/checklist`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
