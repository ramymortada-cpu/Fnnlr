import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { PageBrain } from '../packages/ai-core/src/brains/page.js';
import { PageSectionActionBrain } from '../packages/ai-core/src/brains/page-section-action.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import type { PageBrainInput } from '../packages/ai-core/src/brains/page.js';
import type { Offer } from '../packages/ai-core/src/contracts.js';

const offer: Offer = {
  name: 'كورس النور', promise: 'اتعلّم التسويق', idealCustomer: 'مبتدئين', mainPain: 'مش عارف يبدأ',
  desiredResult: 'مبيعات', transformation: 'من صفر لخبير', deliverables: ['١٠ وحدات'], bonuses: ['قوالب'],
  guarantee: 'ضمان ٧ أيام', pricing: '4000 ج.م', paymentPlan: 'دفعتين', urgency: 'خصم لفترة',
  objections: [{ objection: 'غالي', reply: 'القيمة أكبر' }], cta: 'سجّل', toneNotes: 'ودود',
};
const input: PageBrainInput = {
  funnelName: 'قمع كورس النور', offer, market: 'eg', productType: 'course',
  tone: 'egyptian_friendly', salesChannel: 'whatsapp', paymentMethods: ['instapay'],
};

test('PageBrain parses valid LLM JSON into a structured page plan', async () => {
  const plan = {
    goal: 'تواصل واتساب', angle: 'نتيجة سريعة',
    sectionOrder: ['hero', 'offer'],
    sections: [
      { type: 'hero', title: 'اتعلّم التسويق', body: 'من صفر', bullets: [], ctaLabel: 'كلمنا', ctaTarget: 'whatsapp' },
      { type: 'offer', title: 'العرض', body: '', bullets: ['وحدة ١'] },
    ],
    mobileNotes: 'CTA ثابت', trustElements: ['ضمان'], expectedLeaks: ['طويلة'], trackingRequirements: ['page_view'],
  };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(plan)));
  const { output, degraded } = await gw.run(PageBrain, input, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.sections.length, 2);
  assert.equal(output.sections[0].type, 'hero');
});

test('PageBrain falls back to a complete usable Arabic page without LLM', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(PageBrain, input, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.sections.length >= 8, 'fallback page has a full section set');
  // WhatsApp channel → WhatsApp-first primary CTA
  const hero = output.sections.find((s) => s.type === 'hero');
  assert.equal(hero?.ctaTarget, 'whatsapp');
  assert.match(hero?.ctaLabel ?? '', /واتساب/);
});

test('PageBrain rejects malformed output (triggers fallback)', async () => {
  const gw = new AIGateway(mockLLM(() => 'nope'));
  const { degraded } = await gw.run(PageBrain, input, { tenantId: 't' });
  assert.equal(degraded, true);
});

test('section action returns a preview and does not mutate the input', async () => {
  const section = { type: 'hero' as const, title: 'عنوان', body: 'نص طويل. تفاصيل.', bullets: [] };
  const before = JSON.stringify(section);
  const gw = new AIGateway(failingLLM);
  const { output } = await gw.run(PageSectionActionBrain, { section, action: 'cta_whatsapp_first' }, { tenantId: 't' });
  assert.equal(output.ctaTarget, 'whatsapp');
  assert.match(output.ctaLabel ?? '', /واتساب/);
  assert.equal(JSON.stringify(section), before, 'input section untouched (preview only)');
});

test('section action logs a versioned ai output', async () => {
  const logged: string[] = [];
  const gw = new AIGateway(failingLLM);
  await gw.run(PageSectionActionBrain, { section: { type: 'hero', title: 't', body: 'b', bullets: [] }, action: 'premium' }, {
    tenantId: 't', logOutput: async (r) => { logged.push(r.brain); return 'id'; },
  });
  assert.deepEqual(logged, ['page_section_action']);
});
