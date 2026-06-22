import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { FunnelArchitectBrain } from '../packages/ai-core/src/brains/funnel-architect.js';
import { OfferBrain } from '../packages/ai-core/src/brains/offer.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import type { OnboardingInput } from '../packages/ai-core/src/contracts.js';

/**
 * AI brain contract tests — deterministic, no network, no credentials.
 * Proves: (1) brains parse valid LLM JSON into typed output, (2) brains fall
 * back to a usable draft when the LLM fails, marking the result degraded.
 */

const onboarding: OnboardingInput = {
  businessName: 'أكاديمية نور',
  market: 'eg',
  sells: 'كورس تسويق رقمي',
  productType: 'course',
  priceRange: '3000-5000 EGP',
  targetCustomer: 'أصحاب مشاريع صغيرة',
  trafficSource: 'Meta ads',
  salesChannel: 'whatsapp',
  paymentMethods: ['instapay', 'vodafone_cash'],
  tone: 'egyptian_friendly',
  goal: 'improve WhatsApp conversion',
};

test('FunnelArchitectBrain parses valid LLM JSON into a typed blueprint', async () => {
  const fakeBlueprint = {
    funnelType: 'click_to_whatsapp', objective: 'x', icpSummary: 'y', awarenessLevel: 'problem-aware',
    mainPromise: 'z',
    stages: [{ name: 'Traffic', purpose: 'p', channel: 'meta', conversionEvent: 'tracked_link_click',
      assetsNeeded: ['ad'], expectedLeak: 'broad targeting', trackingRequirement: 'tracked_link_click' }],
    whatsappRole: 'close', paymentRole: 'instapay', followupLogic: 'gentle',
    trackingRequirements: ['page_view'], expectedLeaks: ['slow reply'], launchChecklist: ['publish'],
  };
  const llm = mockLLM(() => '```json\n' + JSON.stringify(fakeBlueprint) + '\n```');
  const gw = new AIGateway(llm);
  const { output, degraded } = await gw.run(FunnelArchitectBrain, onboarding, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.funnelType, 'click_to_whatsapp');
  assert.equal(output.stages.length, 1);
});

test('FunnelArchitectBrain falls back to a usable draft when the LLM fails', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(FunnelArchitectBrain, onboarding, { tenantId: 't' });
  assert.equal(degraded, true, 'must mark degraded');
  assert.ok(output.stages.length >= 4, 'fallback funnel must have real stages');
  assert.ok(output.funnelType, 'fallback must pick a funnel type');
  // WhatsApp-first input → WhatsApp-spined funnel
  assert.equal(output.funnelType, 'course_sales');
});

test('FunnelArchitectBrain rejects malformed LLM output (then would fall back)', async () => {
  const llm = mockLLM(() => 'not json at all');
  const gw = new AIGateway(llm);
  const { degraded } = await gw.run(FunnelArchitectBrain, onboarding, { tenantId: 't' });
  assert.equal(degraded, true, 'invalid JSON must trigger fallback, not crash');
});

test('OfferBrain produces an Arabic-native offer with objections (fallback)', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(OfferBrain, onboarding, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.name.length > 0);
  assert.ok(output.objections.length >= 3, 'offer must handle objections');
  assert.match(output.cta, /واتساب/, 'WhatsApp-channel input → WhatsApp CTA');
});

test('OfferBrain parses a valid LLM offer', async () => {
  const fake = {
    name: 'عرض النور', promise: 'نتيجة مضمونة', idealCustomer: 'x', mainPain: 'y',
    desiredResult: 'z', transformation: 't', deliverables: ['a'], bonuses: ['b'],
    guarantee: 'g', pricing: '4000', paymentPlan: 'دفعتين', urgency: 'محدود',
    objections: [{ objection: 'غالي', reply: 'القيمة أكبر' }], cta: 'كلمنا', toneNotes: 'ودود',
  };
  const llm = mockLLM(() => JSON.stringify(fake));
  const gw = new AIGateway(llm);
  const { output, degraded } = await gw.run(OfferBrain, onboarding, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.name, 'عرض النور');
});

test('AI output is logged via the injected logger', async () => {
  const logged: string[] = [];
  const gw = new AIGateway(failingLLM);
  await gw.run(OfferBrain, onboarding, {
    tenantId: 't',
    logOutput: async (row) => { logged.push(row.brain); return 'id'; },
  });
  assert.deepEqual(logged, ['offer']);
});
