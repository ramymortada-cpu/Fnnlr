import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { Offer, Market, ProductType, Tone, PaymentMethod } from '../contracts.js';

/**
 * PageBrain — turns the funnel + offer + market + tone into a STRUCTURED
 * Arabic landing page (ordered, editable sections), not a markdown blob.
 * Chooses the right primary CTA for Arab buying behavior (often WhatsApp, not "buy now").
 */

export type SectionType =
  | 'hero' | 'problem' | 'promise' | 'offer' | 'benefits' | 'proof'
  | 'pricing' | 'guarantee' | 'faq' | 'cta_whatsapp' | 'cta_payment' | 'final_cta';

export interface PageSectionSpec {
  type: SectionType;
  title: string;
  body: string;
  bullets: string[];
  ctaLabel?: string;
  ctaTarget?: 'whatsapp' | 'payment' | 'none';
}

export interface PagePlan {
  goal: string;
  angle: string;
  sectionOrder: SectionType[];
  sections: PageSectionSpec[];
  mobileNotes: string;
  trustElements: string[];
  expectedLeaks: string[];
  trackingRequirements: string[];
}

export interface PageBrainInput {
  funnelName: string;
  offer: Offer;
  market: Market;
  productType: ProductType;
  tone: Tone;
  salesChannel: string;
  paymentMethods: PaymentMethod[];
  whatsappRole?: string;
  expectedLeaks?: string[];
  playbookContext?: string | null;
}

export const PageBrain: Brain<PageBrainInput, PagePlan> = {
  name: 'page',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market landing-page strategist for fnnlr.',
      'Design RTL Arabic landing pages for Egypt and the Gulf where the sale often closes in WhatsApp.',
      'The primary CTA is often "كلمنا على واتساب" or "احجز مكالمة", not "اشترِ الآن" — choose per funnel.',
      'Native Arabic, dialect-aware, mobile-first. Return ONLY structured JSON, no prose.',
    ].join(' ');
    const user = [
      `Funnel: ${input.funnelName}`,
      `Offer: ${JSON.stringify(input.offer)}`,
      `Market: ${input.market} · Product: ${input.productType} · Tone: ${input.tone}`,
      `Primary sales channel: ${input.salesChannel} · Payment: ${input.paymentMethods.join(', ')}`,
      `WhatsApp role: ${input.whatsappRole ?? 'close the sale'}`,
      input.playbookContext ? `Learning playbook context (use cautiously): ${input.playbookContext}` : '',
      '',
      'Return JSON: goal, angle, sectionOrder[] (section types in order),',
      'sections[] (each: type, title, body, bullets[], ctaLabel?, ctaTarget? one of whatsapp|payment|none),',
      'mobileNotes, trustElements[], expectedLeaks[], trackingRequirements[].',
      'Section types: hero, problem, promise, offer, benefits, proof, pricing, guarantee, faq,',
      'cta_whatsapp, cta_payment, final_cta.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<PagePlan>;
    if (!Array.isArray(o.sections) || o.sections.length === 0) {
      throw new Error('PageBrain: missing sections');
    }
    return {
      goal: o.goal ?? '',
      angle: o.angle ?? '',
      sectionOrder: o.sectionOrder ?? o.sections.map((s) => s.type),
      sections: o.sections as PageSectionSpec[],
      mobileNotes: o.mobileNotes ?? '',
      trustElements: o.trustElements ?? [],
      expectedLeaks: o.expectedLeaks ?? [],
      trackingRequirements: o.trackingRequirements ?? ['page_view', 'scroll_depth', 'cta_clicked'],
    };
  },

  /**
   * Deterministic fallback: a complete, usable Arabic page built from the offer.
   * WhatsApp-first CTA when the channel is WhatsApp. Marked degraded.
   */
  fallback(input) {
    const o = input.offer;
    const waFirst = input.salesChannel === 'whatsapp' || input.salesChannel === 'manual_transfer';
    const primaryCta = waFirst ? 'كلمنا على واتساب' : (o.cta || 'ابدأ الآن');

    const sections: PageSectionSpec[] = [
      { type: 'hero', title: o.promise || o.name, body: o.transformation || '',
        bullets: [], ctaLabel: primaryCta, ctaTarget: waFirst ? 'whatsapp' : 'payment' },
      { type: 'problem', title: 'المشكلة اللي بتواجهك', body: o.mainPain || '', bullets: [] },
      { type: 'promise', title: 'الوعد', body: o.promise || '', bullets: [] },
      { type: 'offer', title: `إيه اللي هتاخده في ${o.name}`, body: o.desiredResult || '',
        bullets: [...(o.deliverables || []), ...(o.bonuses || []).map((b) => `بونص: ${b}`)] },
      { type: 'benefits', title: 'النتيجة اللي هتوصّلها', body: '', bullets: o.deliverables || [] },
      { type: 'proof', title: 'ناس زيّك بدأت', body: 'آراء وتجارب عملائنا', bullets: [] },
      { type: 'pricing', title: 'الاستثمار', body: `${o.pricing || ''}${o.paymentPlan ? ' · ' + o.paymentPlan : ''}`, bullets: [] },
      { type: 'guarantee', title: 'ضمانك', body: o.guarantee || '', bullets: [] },
      { type: 'faq', title: 'أسئلة شائعة', body: '',
        bullets: (o.objections || []).map((ob) => `${ob.objection} — ${ob.reply}`) },
      { type: waFirst ? 'cta_whatsapp' : 'cta_payment', title: 'جاهز تبدأ؟', body: o.urgency || '',
        bullets: [], ctaLabel: primaryCta, ctaTarget: waFirst ? 'whatsapp' : 'payment' },
      { type: 'final_cta', title: 'خطوتك الجاية', body: o.urgency || '', bullets: [],
        ctaLabel: primaryCta, ctaTarget: waFirst ? 'whatsapp' : 'payment' },
    ];

    return {
      goal: waFirst ? 'دفع الزائر للتواصل على واتساب' : 'دفع الزائر لإتمام الدفع',
      angle: o.promise || '',
      sectionOrder: sections.map((s) => s.type),
      sections,
      mobileNotes: 'الموبايل أولًا: CTA ثابت أسفل الشاشة، أزرار كبيرة، نص قصير.',
      trustElements: ['آراء عملاء', 'ضمان واضح', 'وسائل دفع محلية', 'رقم واتساب حقيقي'],
      expectedLeaks: input.expectedLeaks || ['الصفحة طويلة', 'CTA غير واضح', 'مفيش إثبات كافٍ'],
      trackingRequirements: ['page_view', 'scroll_depth', 'price_reached', 'cta_clicked', 'whatsapp_clicked'],
    };
  },
};
