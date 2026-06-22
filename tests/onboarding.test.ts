import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { FunnelArchitectBrain } from '../packages/ai-core/src/brains/funnel-architect.js';
import { OfferBrain } from '../packages/ai-core/src/brains/offer.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import type { OnboardingInput } from '../packages/ai-core/src/contracts.js';

/**
 * Sprint 3 — onboarding → blueprint flow (logic level, no DB).
 * Proves the wizard's collected answers produce a complete, persistable
 * blueprint + offer that the result screen and funnel service expect.
 */

const wizardAnswers: OnboardingInput = {
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

test('onboarding answers produce a complete blueprint ready to persist (with LLM)', async () => {
  const blueprint = {
    funnelType: 'course_sales', objective: 'بيع الكورس', icpSummary: 'أصحاب مشاريع',
    awarenessLevel: 'problem-aware', mainPromise: 'وصول لنتيجة',
    stages: [
      { name: 'مصدر الزيارات', purpose: 'جذب', channel: 'meta', conversionEvent: 'tracked_link_click',
        assetsNeeded: ['إعلان'], expectedLeak: 'استهداف واسع', trackingRequirement: 'tracked_link_click' },
      { name: 'واتساب', purpose: 'إغلاق', channel: 'whatsapp', conversionEvent: 'price_sent',
        assetsNeeded: ['سكريبت'], expectedLeak: 'بطء الرد', trackingRequirement: 'message_received' },
    ],
    whatsappRole: 'القناة الأساسية', paymentRole: 'إنستاباي', followupLogic: 'لطيف',
    trackingRequirements: ['page_view'], expectedLeaks: ['بطء الرد'], launchChecklist: ['انشر الصفحة'],
  };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(blueprint)));
  const { output, degraded } = await gw.run(FunnelArchitectBrain, wizardAnswers, { tenantId: 't' });

  assert.equal(degraded, false);
  // Everything the result screen + funnel_stages persistence needs:
  assert.ok(output.funnelType && output.mainPromise && output.objective);
  assert.ok(output.stages.length >= 2);
  for (const s of output.stages) {
    assert.ok(s.name && s.channel && s.conversionEvent, 'each stage must be persistable');
  }
  assert.ok(Array.isArray(output.expectedLeaks) && Array.isArray(output.launchChecklist));
});

test('onboarding still yields a usable blueprint with NO AI key (degraded)', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(FunnelArchitectBrain, wizardAnswers, { tenantId: 't' });
  assert.equal(degraded, true, 'must flag degraded so the UI shows the draft banner');
  assert.ok(output.stages.length >= 4, 'fallback must still give a real, editable funnel');
  // WhatsApp-first course → course_sales, WhatsApp-spined
  assert.equal(output.funnelType, 'course_sales');
  assert.match(output.paymentRole, /إنستاباي|instapay/i);
});

test('offer generated alongside the funnel is Arabic and channel-aware', async () => {
  const gw = new AIGateway(failingLLM);
  const { output } = await gw.run(OfferBrain, wizardAnswers, { tenantId: 't' });
  assert.ok(output.name && output.promise);
  assert.ok(output.objections.length >= 3);
  assert.match(output.cta, /واتساب/);
});
