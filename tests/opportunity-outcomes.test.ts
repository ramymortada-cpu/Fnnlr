import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { interpretOpportunityOutcome, aggregateLearning, applyLearningToScore, type OutcomeSignals, type LearningRecord } from '../modules/opportunities/src/outcome-engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 26 — Opportunity Capture Learning Loop. The outcome engine + learning
 * aggregation + scoring feedback are pure and tested here: evidence-based
 * capture only, honest confidence, learning never overrides obvious urgency.
 */

function sig(over: Partial<OutcomeSignals> = {}): OutcomeSignals {
  return { opportunityType: 'waiting_payment_recovery', detectedHoursAgo: 5, acted: false, ...over };
}

test('waiting payment captured when payment confirmed', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'waiting_payment_recovery', paymentConfirmed: true, amount: 500, currency: 'EGP' }));
  assert.equal(r.status, 'captured');
  assert.equal(r.capturedValue, 500);
});

test('proof review captured when confirmed', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'proof_review', proofReviewed: true }));
  assert.equal(r.status, 'captured');
});

test('access delivery captured when access delivered', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'access_delivery', accessDelivered: true }));
  assert.equal(r.status, 'captured');
});

test('whatsapp first reply captured by stage movement (progression, not revenue)', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'whatsapp_first_reply', contactedProgressed: true, leadStage: 'contacted' }));
  assert.equal(r.status, 'captured');
  assert.equal(r.capturedValue, null);     // progression captured, no money
});

test('follow-up captured by task completion / stage movement', () => {
  assert.equal(interpretOpportunityOutcome(sig({ opportunityType: 'followup_reactivation', taskCompleted: true })).status, 'captured');
  assert.equal(interpretOpportunityOutcome(sig({ opportunityType: 'followup_reactivation', stageProgressed: true, leadStage: 'qualified' })).status, 'captured');
});

test('NO fake capture without evidence → awaiting_evidence', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'waiting_payment_recovery', acted: true }));
  assert.equal(r.status, 'awaiting_evidence');
  assert.equal(r.capturedValue, null);
});

test('expired when no action past the type threshold', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'whatsapp_first_reply', acted: false, detectedHoursAgo: 100 }));
  assert.equal(r.status, 'expired');
});

test('missed when action taken but lead lost', () => {
  const r = interpretOpportunityOutcome(sig({ opportunityType: 'waiting_payment_recovery', acted: true, leadLost: true }));
  assert.equal(r.status, 'missed');
});

test('leak repair: inconclusive when applied, captured when improved', () => {
  assert.equal(interpretOpportunityOutcome(sig({ opportunityType: 'leak_repair', repairApplied: true })).status, 'inconclusive');
  assert.equal(interpretOpportunityOutcome(sig({ opportunityType: 'leak_repair', repairImproved: true })).status, 'captured');
});

test('learning aggregation by opportunity_type: capture rate over decided only', () => {
  const recs: LearningRecord[] = [
    { opportunityType: 'waiting_payment_recovery', status: 'captured' },
    { opportunityType: 'waiting_payment_recovery', status: 'captured' },
    { opportunityType: 'waiting_payment_recovery', status: 'missed' },
    { opportunityType: 'waiting_payment_recovery', status: 'awaiting_evidence' },   // not counted in rate
  ];
  const agg = aggregateLearning(recs)[0];
  assert.equal(agg.decided, 3);
  assert.ok(Math.abs((agg.captureRate ?? 0) - 2 / 3) < 1e-9);
});

test('insufficient learning is low confidence and limited', () => {
  const agg = aggregateLearning([{ opportunityType: 'proof_review', status: 'captured' }])[0];
  assert.equal(agg.confidence, 'low');
  assert.equal(agg.limited, true);
});

test('high confidence requires enough DECIDED, not inflated by awaiting', () => {
  const decided = Array.from({ length: 25 }, () => ({ opportunityType: 'x', status: 'captured' as const }));
  const awaiting = Array.from({ length: 40 }, () => ({ opportunityType: 'x', status: 'awaiting_evidence' as const }));
  const agg = aggregateLearning([...decided, ...awaiting])[0];
  assert.notEqual(agg.confidence, 'high');   // mostly undecided → capped at medium
});

test('scoring feedback: high capture rate raises score with a note', () => {
  const learning = aggregateLearning(Array.from({ length: 10 }, () => ({ opportunityType: 'x', status: 'captured' as const })))[0];
  const r = applyLearningToScore(50, 'medium', learning);
  assert.ok(r.score > 50);
  assert.ok(r.note);
});

test('scoring feedback NEVER lowers a critical/high-urgency opportunity', () => {
  const lowCapture = aggregateLearning([
    ...Array.from({ length: 8 }, () => ({ opportunityType: 'x', status: 'missed' as const })),
    ...Array.from({ length: 2 }, () => ({ opportunityType: 'x', status: 'captured' as const })),
  ])[0];
  const r = applyLearningToScore(70, 'critical', lowCapture);
  assert.ok(r.score >= 70);     // urgency protected
});

test('insufficient learning does not change the score', () => {
  const learning = aggregateLearning([{ opportunityType: 'x', status: 'captured' }])[0];
  const r = applyLearningToScore(60, 'medium', learning);
  assert.equal(r.score, 60);
});

test('command classifier routes opportunity-outcome intents', () => {
  assert.equal(classifyCommand('أي فرص اتحولت؟').intent, 'which_opportunities_captured');
  assert.equal(classifyCommand('اتعلمنا إيه من فرص الإيراد؟').intent, 'what_learned_opportunities');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: method === 'POST' ? '{}' : undefined,
  });
  return { status: res.status };
}

test('SECURITY: opportunity outcome routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/opportunities/o1/outcome/check', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/opportunities/learning', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/opportunities/outcomes/summary', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/opportunities/o1/mark-missed', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
