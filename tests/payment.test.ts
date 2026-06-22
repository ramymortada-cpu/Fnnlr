import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { PaymentFlowBrain, suggestedMethods } from '../packages/ai-core/src/brains/payment-flow.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import { canTransition, eventForState, nextActionFor, PAYMENT_STATES } from '../modules/payments/src/state-machine.js';
import { detectLeaks } from '../modules/leaks/src/engine.js';
import type { PaymentFlowInput } from '../packages/ai-core/src/brains/payment-flow.js';
import type { Offer } from '../packages/ai-core/src/contracts.js';

const offer: Offer = {
  name: 'كورس النور', promise: 'اتعلّم', idealCustomer: 'x', mainPain: 'y', desiredResult: 'z',
  transformation: 't', deliverables: [], bonuses: [], guarantee: 'g', pricing: '4000 ج.م',
  paymentPlan: '', urgency: '', objections: [], cta: 'كلمنا', toneNotes: '',
};
const input: PaymentFlowInput = { offer, price: '4000 ج.م', market: 'eg', method: 'instapay', tone: 'egyptian_friendly' };

test('PaymentFlowBrain parses valid LLM JSON', async () => {
  const copy = { customerInstructions: 'حوّل على X', whatsappMessage: 'ادفع على X', proofInstructions: 'صوّر',
    confirmationMessage: 'وصل', reminderMessage: 'تذكير', stuckFollowupMessage: 'مشكلة؟', deliveryMessage: 'اتفعّل', reassuranceNote: 'آمن' };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(copy)));
  const { output, degraded } = await gw.run(PaymentFlowBrain, input, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.whatsappMessage, 'ادفع على X');
});

test('PaymentFlowBrain falls back to practical Arabic copy without LLM', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(PaymentFlowBrain, input, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.customerInstructions.includes('إنستاباي'));
  assert.ok(output.whatsappMessage.length > 0);
  assert.ok(output.confirmationMessage.length > 0);
});

test('suggestedMethods differ by market', () => {
  assert.ok(suggestedMethods('eg').includes('instapay'));
  assert.ok(suggestedMethods('sa').includes('tap'));
});

test('payment state machine allows valid transitions and blocks invalid ones', () => {
  assert.equal(canTransition('not_started', 'payment_details_sent'), true);
  assert.equal(canTransition('waiting_payment', 'proof_uploaded'), true);
  assert.equal(canTransition('confirmed', 'access_delivered'), true);
  // invalid jumps
  assert.equal(canTransition('not_started', 'access_delivered'), false);
  assert.equal(canTransition('cancelled', 'confirmed'), false);
});

test('each payment state maps to an event and a next action', () => {
  assert.equal(eventForState('confirmed'), 'payment_confirmed');
  assert.equal(eventForState('proof_uploaded'), 'proof_uploaded');
  assert.ok(nextActionFor('waiting_payment').length > 0);
  assert.equal(PAYMENT_STATES.length, 11);
});

test('leak engine detects missing payment method (with evidence)', () => {
  const base: any = {
    hasTrackedLinks: true, linksCount: 1, linksWithoutUtm: 0, inactiveLinkInUse: false,
    totalClicks: 5, leadsCount: 5, leadsWithoutAttribution: 0,
    pagePublished: false, pageViews: 0, scrollReached50: 0, priceReached: 0, ctaClicks: 0,
    whatsappClicks: 0, pageUsesTrackedLink: false, leadsByStage: {}, leadsStuckWhatsappClicked: 0,
    conversationsWithoutContact: 0, leadsWithoutNextAction: 0, hasWhatsappFlow: true, hasFirstReplyTemplate: true, hasFollowupTemplate: true, clickedNoReplySent: 0, waitingPaymentCount: 0, waitingPaymentStuck: 0,
    proofUploadedNotConfirmed: 0, paidNotDelivered: 0, paymentStuckCount: 0,
    hasPaymentMethod: false, paymentMethodsMissingInstructions: 0, proofRequiredNoProofStep: 0,
    proofUploadedNotReviewed: 0, confirmedNotDelivered: 0, inactiveMethodInUse: false,
    detailsSentNoWaiting: 0, waitingNoFollowupTask: 0,
    overdueTasks: 0, leadsNeedingFollowupNoDate: 0, lostWithoutReason: 0, highRiskNoAction: 0, avgDealValue: null,
  };
  const f = detectLeaks(base);
  const leak = f.find((x) => x.code === 'payment.no_method');
  assert.ok(leak, 'missing payment method detected');
  assert.equal(leak!.evidence.hasPaymentMethod, false);
});

test('leak engine detects proof uploaded but not reviewed', () => {
  const base: any = {
    hasTrackedLinks: true, linksCount: 1, linksWithoutUtm: 0, inactiveLinkInUse: false,
    totalClicks: 5, leadsCount: 5, leadsWithoutAttribution: 0,
    pagePublished: false, pageViews: 0, scrollReached50: 0, priceReached: 0, ctaClicks: 0,
    whatsappClicks: 0, pageUsesTrackedLink: false, leadsByStage: {}, leadsStuckWhatsappClicked: 0,
    conversationsWithoutContact: 0, leadsWithoutNextAction: 0, hasWhatsappFlow: true, hasFirstReplyTemplate: true, hasFollowupTemplate: true, clickedNoReplySent: 0, waitingPaymentCount: 0, waitingPaymentStuck: 0,
    proofUploadedNotConfirmed: 0, paidNotDelivered: 0, paymentStuckCount: 0,
    hasPaymentMethod: true, paymentMethodsMissingInstructions: 0, proofRequiredNoProofStep: 0,
    proofUploadedNotReviewed: 3, confirmedNotDelivered: 0, inactiveMethodInUse: false,
    detailsSentNoWaiting: 0, waitingNoFollowupTask: 0,
    overdueTasks: 0, leadsNeedingFollowupNoDate: 0, lostWithoutReason: 0, highRiskNoAction: 0, avgDealValue: 1000,
  };
  const leak = detectLeaks(base).find((x) => x.code === 'payment.proof_not_reviewed');
  assert.ok(leak);
  assert.equal(leak!.evidence.proofUploadedNotReviewed, 3);
  assert.equal(leak!.moneyImpact, 3000);
});

// ---- API ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, opts: { tenant?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

test('DEV: add payment method requires a method', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels/j1/payment-flow/methods', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /method/);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: payment routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/funnels/j1/payment-flow', { tenant: 'attacker' });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
