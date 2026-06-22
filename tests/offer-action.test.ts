import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { OfferActionBrain } from '../packages/ai-core/src/brains/offer-action.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import type { Offer } from '../packages/ai-core/src/contracts.js';

/**
 * Sprint 4 — offer AI actions (logic level, no DB).
 * Proves: an action returns a transformed PREVIEW, logs a versioned output,
 * works degraded without an LLM, and (by contract) never mutates the input —
 * the service only persists on explicit apply.
 */

const baseOffer: Offer = {
  name: 'عرض النور', promise: 'نتيجة في التسويق', idealCustomer: 'أصحاب مشاريع',
  mainPain: 'مش عارف يبدأ', desiredResult: 'مبيعات', transformation: 'من التردد للنتيجة',
  deliverables: ['كورس'], bonuses: ['متابعة'], guarantee: 'ضمان', pricing: '4000',
  paymentPlan: 'دفعة', urgency: '', objections: [{ objection: 'غالي', reply: 'القيمة أكبر' }],
  cta: 'كلمنا', toneNotes: 'ودود',
};

test('offer action returns a transformed preview (with LLM)', async () => {
  const transformed = { ...baseOffer, name: 'عرض النور — نسخة راقية', toneNotes: 'فخم' };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(transformed)));
  const { output, degraded } = await gw.run(OfferActionBrain, { offer: baseOffer, action: 'premium' }, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.name, 'عرض النور — نسخة راقية');
});

test('offer action does NOT mutate the input offer (preview only)', async () => {
  const gw = new AIGateway(failingLLM);
  const before = JSON.stringify(baseOffer);
  await gw.run(OfferActionBrain, { offer: baseOffer, action: 'strengthen_objections' }, { tenantId: 't' });
  assert.equal(JSON.stringify(baseOffer), before, 'input offer must be untouched until user applies');
});

test('strengthen_objections fallback adds an objection in the preview', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(OfferActionBrain, { offer: baseOffer, action: 'strengthen_objections' }, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.objections.length > baseOffer.objections.length, 'preview gains an objection');
});

test('soften fallback removes urgency in the preview', async () => {
  const withUrgency: Offer = { ...baseOffer, urgency: 'محدود جدًا!' };
  const gw = new AIGateway(failingLLM);
  const { output } = await gw.run(OfferActionBrain, { offer: withUrgency, action: 'soften' }, { tenantId: 't' });
  assert.equal(output.urgency, '', 'softened preview drops urgency');
  assert.equal(withUrgency.urgency, 'محدود جدًا!', 'original unchanged');
});

test('each action logs a versioned ai output', async () => {
  const logged: { brain: string; promptVersion: string }[] = [];
  const gw = new AIGateway(failingLLM);
  await gw.run(OfferActionBrain, { offer: baseOffer, action: 'improve' }, {
    tenantId: 't',
    logOutput: async (row) => { logged.push({ brain: row.brain, promptVersion: row.promptVersion }); return 'id'; },
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].brain, 'offer_action');
  assert.equal(logged[0].promptVersion, 'v1');
});

test('improve_cta fallback changes only the CTA, keeps the rest', async () => {
  const gw = new AIGateway(failingLLM);
  const { output } = await gw.run(OfferActionBrain, { offer: baseOffer, action: 'improve_cta' }, { tenantId: 't' });
  assert.notEqual(output.cta, baseOffer.cta);
  assert.equal(output.promise, baseOffer.promise, 'promise unchanged by a CTA action');
});
