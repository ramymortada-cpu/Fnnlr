import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { detectOpportunities, valueSummary, type OpportunityInputs } from '../modules/opportunities/src/engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 25 — Revenue Opportunity Engine. Detection + rule-based scoring are
 * pure and tested here: real records → prioritized, evidence-backed
 * opportunities; estimated value ONLY when an observed amount exists. DB-backed
 * refresh / resolution run in the live suite.
 */

function inputs(over: Partial<OpportunityInputs> = {}): OpportunityInputs {
  return { leads: [], payments: [], leaks: [], transfers: [], ...over };
}

test('access delivery detected (confirmed payment, not delivered) — critical', () => {
  const cands = detectOpportunities(inputs({ payments: [{ leadId: 'l1', state: 'confirmed', amount: 500, currency: 'EGP', proofReceived: true, accessDelivered: false, proofAgeHours: 5, hasReviewTask: false, hasDeliveryTask: false }] }));
  const o = cands.find((x) => x.opportunityType === 'access_delivery');
  assert.ok(o);
  assert.equal(o!.urgency, 'critical');
  assert.equal(o!.estimatedValue, 500);          // observed amount → value shown
  assert.equal(o!.valueCurrency, 'EGP');
});

test('proof review detected (proof uploaded, not confirmed)', () => {
  const cands = detectOpportunities(inputs({ payments: [{ leadId: 'l2', state: 'proof_uploaded', amount: null, currency: null, proofReceived: true, accessDelivered: false, proofAgeHours: 30, hasReviewTask: false, hasDeliveryTask: false }] }));
  const o = cands.find((x) => x.opportunityType === 'proof_review');
  assert.ok(o);
  assert.equal(o!.estimatedValue, null);          // NO fake value without an amount
});

test('waiting payment recovery detected', () => {
  const cands = detectOpportunities(inputs({ leads: [{ id: 'l3', name: 'سارة', stage: 'waiting_payment', stageAgeHours: 30, hasFollowupTask: false }] }));
  const o = cands.find((x) => x.opportunityType === 'waiting_payment_recovery');
  assert.ok(o);
  assert.equal(o!.estimatedValue, null);
});

test('whatsapp first reply detected; expiring service window makes it critical', () => {
  const open = detectOpportunities(inputs({ leads: [{ id: 'l4', stage: 'whatsapp_clicked', stageAgeHours: 2, serviceWindow: 'open', hasFollowupTask: false }] }));
  const exp = detectOpportunities(inputs({ leads: [{ id: 'l5', stage: 'whatsapp_clicked', stageAgeHours: 2, serviceWindow: 'expiring_soon', hasFollowupTask: false }] }));
  const oOpen = open.find((x) => x.opportunityType === 'whatsapp_first_reply')!;
  const oExp = exp.find((x) => x.opportunityType === 'whatsapp_first_reply')!;
  assert.equal(oExp.urgency, 'critical');
  assert.ok(oExp.priorityScore > oOpen.priorityScore);   // service window urgency boosts score
});

test('NO fake estimated value anywhere without a known deal value', () => {
  const cands = detectOpportunities(inputs({
    leads: [{ id: 'l6', stage: 'waiting_payment', stageAgeHours: 30, hasFollowupTask: false }, { id: 'l7', stage: 'whatsapp_clicked', stageAgeHours: 1, serviceWindow: 'open', hasFollowupTask: false }],
    payments: [{ leadId: 'l6', state: 'pending', amount: null, currency: null, proofReceived: false, accessDelivered: false, proofAgeHours: null, hasReviewTask: false, hasDeliveryTask: false }],
  }));
  for (const o of cands) if (o.estimatedValue !== null) assert.fail('value should be null without amount');
});

test('priority scoring is explained (scoreReasons in evidence)', () => {
  const cands = detectOpportunities(inputs({ payments: [{ leadId: 'l8', state: 'confirmed', amount: 300, currency: 'EGP', proofReceived: true, accessDelivered: false, proofAgeHours: 2, hasReviewTask: false, hasDeliveryTask: false }] }));
  const o = cands[0];
  assert.ok(Array.isArray((o.evidence as any).scoreReasons));
  assert.ok((o.evidence as any).scoreReasons.length > 0);
  assert.ok(o.explanation.includes('الترتيب'));
});

test('existing delivery task lowers the access-delivery score (dedup signal)', () => {
  const withTask = detectOpportunities(inputs({ payments: [{ leadId: 'l9', state: 'confirmed', amount: 100, currency: 'EGP', proofReceived: true, accessDelivered: false, proofAgeHours: 2, hasReviewTask: false, hasDeliveryTask: true }] }))[0];
  const noTask = detectOpportunities(inputs({ payments: [{ leadId: 'l10', state: 'confirmed', amount: 100, currency: 'EGP', proofReceived: true, accessDelivered: false, proofAgeHours: 2, hasReviewTask: false, hasDeliveryTask: false }] }))[0];
  assert.ok(withTask.priorityScore < noTask.priorityScore);
});

test('leak repair opportunity only for high/critical leaks with enough data', () => {
  const cands = detectOpportunities(inputs({ leaks: [
    { id: 'k1', severity: 'critical', lane: 'payment', hasRepairPlan: false, enoughData: true },
    { id: 'k2', severity: 'low', lane: 'page', hasRepairPlan: false, enoughData: true },
  ] }));
  const repairs = cands.filter((x) => x.opportunityType === 'leak_repair');
  assert.equal(repairs.length, 1);
  assert.equal((repairs[0].evidence as any).severity, 'critical');
});

test('valueSummary sums only known amounts, keeps the rest as a count', () => {
  const vs = valueSummary([{ estimatedValue: 500, valueCurrency: 'EGP' }, { estimatedValue: null, valueCurrency: null }, { estimatedValue: 300, valueCurrency: 'EGP' }]);
  assert.equal(vs.knownTotal, 800);
  assert.equal(vs.withValue, 2);
  assert.equal(vs.withoutValue, 1);
});

test('valueSummary returns null total when nothing has a value', () => {
  const vs = valueSummary([{ estimatedValue: null, valueCurrency: null }, { estimatedValue: null, valueCurrency: null }]);
  assert.equal(vs.knownTotal, null);
  assert.equal(vs.withoutValue, 2);
});

test('command classifier routes opportunity intents', () => {
  assert.equal(classifyCommand('فين أقرب فلوس؟').intent, 'nearest_revenue');
  assert.equal(classifyCommand('إيه أسرع فرصة النهارده؟').intent, 'fastest_opportunity');
  assert.equal(classifyCommand('هات العملاء الأقرب للدفع').intent, 'leads_closest_to_payment');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: method === 'POST' || method === 'PATCH' ? '{}' : undefined,
  });
  return { status: res.status };
}

test('SECURITY: opportunity routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/opportunities', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/opportunities/summary', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/funnels/f1/opportunities/refresh', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/opportunities/o1/create-task', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
