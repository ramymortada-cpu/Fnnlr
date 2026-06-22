import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { classifyIncidents, highestSeverity, type OperatingEvidence } from '../modules/operating-room/src/incidents.js';
import { decideGate } from '../modules/operating-room/src/decision.js';

/**
 * Sprint 39 — operating room. Pure classifier + decision-gate coverage. The live
 * smoke path runs in the live-DB suite.
 */

function evidence(over: Partial<OperatingEvidence> = {}): OperatingEvidence {
  return {
    health: { control_db: 'ok', integrations: 'ok', llm: 'ok', jobs: 'ok' },
    releaseChecker: { pass: true, blocking: [] },
    isProd: false,
    devTrustInProd: false,
    encryptionFailClosed: true,
    activation: { stage: 'traffic_ready', launchReady: true, blockingReason: null },
    signals: { pageViews: 10, whatsappClicks: 2, leads: 1, paymentStates: 0 },
    desk: { activationMode: false, itemCount: 3 },
    ops: { jobFailures24h: 0, webhookFailures24h: 0, retriesPending: 0, abandoned24h: 0 },
    recommendations: { count: 2, outcomesMeasured: 0 },
    ...over,
  };
}

test('P0 when the control DB is unreachable', () => {
  const inc = classifyIncidents(evidence({ health: { control_db: 'failed', integrations: 'ok', llm: 'ok', jobs: 'ok' } }));
  assert.ok(inc.some((i) => i.severity === 'P0' && i.code === 'control_db_unreachable'));
  assert.equal(highestSeverity(inc), 'P0');
});

test('P0 when dev tenant trust is on in production', () => {
  const inc = classifyIncidents(evidence({ isProd: true, devTrustInProd: true }));
  assert.ok(inc.some((i) => i.severity === 'P0' && i.code === 'dev_tenant_trust_in_prod'));
});

test('P0 when encryption does not fail closed in production', () => {
  const inc = classifyIncidents(evidence({ isProd: true, encryptionFailClosed: false }));
  assert.ok(inc.some((i) => i.severity === 'P0' && i.code === 'encryption_not_fail_closed'));
});

test('P1 when WhatsApp clicks exist but no lead was created', () => {
  const inc = classifyIncidents(evidence({ signals: { pageViews: 5, whatsappClicks: 3, leads: 0, paymentStates: 0 } }));
  assert.ok(inc.some((i) => i.severity === 'P1' && i.code === 'clicks_without_leads'));
});

test('P1 when jobs fail repeatedly', () => {
  const inc = classifyIncidents(evidence({ ops: { jobFailures24h: 4, webhookFailures24h: 0, retriesPending: 0, abandoned24h: 0 } }));
  assert.ok(inc.some((i) => i.severity === 'P1' && i.code === 'jobs_failing'));
});

test('P2 for degraded LLM (fallback works)', () => {
  const inc = classifyIncidents(evidence({ health: { control_db: 'ok', integrations: 'ok', llm: 'degraded', jobs: 'ok' } }));
  assert.ok(inc.some((i) => i.severity === 'P2' && i.code === 'llm_degraded'));
  assert.ok(!inc.some((i) => i.severity === 'P0' || i.severity === 'P1'));
});

test('P3 informational when no traffic yet', () => {
  const inc = classifyIncidents(evidence({ signals: { pageViews: 0, whatsappClicks: 0, leads: 0, paymentStates: 0 } }));
  assert.ok(inc.some((i) => i.severity === 'P3' && i.code === 'no_traffic_yet'));
});

test('decision gate CONTINUE when healthy with signals', () => {
  const e = evidence();
  const d = decideGate(e, classifyIncidents(e));
  assert.equal(d.decision, 'CONTINUE');
  assert.equal(d.confidence, 'high');
});

test('decision gate NEEDS_CONFIGURATION when activation not launch-ready', () => {
  const e = evidence({ activation: { stage: 'setup', launchReady: false, blockingReason: 'محتاج تحدّد طريقة دفع.' }, signals: { pageViews: 0, whatsappClicks: 0, leads: 0, paymentStates: 0 } });
  const d = decideGate(e, classifyIncidents(e));
  assert.equal(d.decision, 'NEEDS_CONFIGURATION');
  assert.ok(d.blockers.some((b) => b.includes('دفع')));
});

test('decision gate HOLD when launch-ready but a real flow is broken (P1)', () => {
  const e = evidence({ signals: { pageViews: 5, whatsappClicks: 3, leads: 0, paymentStates: 0 } });
  const d = decideGate(e, classifyIncidents(e));
  assert.equal(d.decision, 'HOLD');
});

test('decision gate ROLLBACK for a P0', () => {
  const e = evidence({ isProd: true, devTrustInProd: true });
  const d = decideGate(e, classifyIncidents(e));
  assert.equal(d.decision, 'ROLLBACK_OR_DISABLE');
  assert.equal(d.confidence, 'high');
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('operating-room admin endpoints reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/admin/daily-check?funnelId=f1`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
