import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { OnboardingInput, Offer } from '../contracts.js';

/**
 * OfferBrain — builds a full Arabic-native offer. Not translated English
 * direct-response; understands Egyptian/Gulf trust patterns and hesitation.
 */
export const OfferBrain: Brain<OnboardingInput, Offer> = {
  name: 'offer',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market offer strategist for fnnlr.',
      'Build offers native to Egyptian/Gulf buying psychology — trust, tone, hesitation patterns.',
      'Do not translate English formulas. Return ONLY JSON, no prose.',
    ].join(' ');
    const user = [
      `Business: ${input.businessName} — sells ${input.sells} (${input.productType})`,
      `Market: ${input.market} · Price: ${input.priceRange} · Tone: ${input.tone}`,
      `Target customer: ${input.targetCustomer} · Goal: ${input.goal}`,
      input.playbookContext ? `Learning playbook context (use cautiously): ${input.playbookContext}` : '',
      '',
      'Return JSON with keys: name, promise, idealCustomer, mainPain, desiredResult, transformation,',
      'deliverables[], bonuses[], guarantee, pricing, paymentPlan, urgency,',
      'objections[] (each: objection, reply), cta, toneNotes.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<Offer>;
    if (!o.name || !o.promise) throw new Error('Offer: missing name/promise');
    return {
      name: o.name, promise: o.promise,
      idealCustomer: o.idealCustomer ?? '', mainPain: o.mainPain ?? '',
      desiredResult: o.desiredResult ?? '', transformation: o.transformation ?? '',
      deliverables: o.deliverables ?? [], bonuses: o.bonuses ?? [],
      guarantee: o.guarantee ?? '', pricing: o.pricing ?? '',
      paymentPlan: o.paymentPlan ?? '', urgency: o.urgency ?? '',
      objections: o.objections ?? [], cta: o.cta ?? '', toneNotes: o.toneNotes ?? '',
    };
  },

  fallback(input) {
    return {
      name: `عرض ${input.sells}`,
      promise: `احصل على نتيجة ${input.sells} بطريقة مضمونة ومناسبة للسوق ${input.market === 'eg' ? 'المصري' : 'الخليجي'}`,
      idealCustomer: input.targetCustomer,
      mainPain: 'صعوبة الوصول للنتيجة بمفرده',
      desiredResult: input.goal,
      transformation: 'من التردد إلى نتيجة واضحة',
      deliverables: [input.sells],
      bonuses: ['متابعة شخصية', 'مجموعة دعم'],
      guarantee: 'ضمان استرداد لو ماشوفتش قيمة في أول فترة',
      pricing: input.priceRange,
      paymentPlan: input.paymentMethods.includes('instapay') ? 'دفعة كاملة أو على دفعتين عبر إنستاباي' : 'دفعة كاملة',
      urgency: 'الأماكن/الأسعار محدودة لفترة',
      objections: [
        { objection: 'السعر غالي', reply: 'خلّينا نوضّح قد إيه النتيجة بتساوي مقارنة بالتكلفة' },
        { objection: 'مش متأكد إنه ينفع معايا', reply: 'عندنا ضمان وتجارب ناس زيّك بالظبط' },
        { objection: 'هفكّر', reply: 'تمام — إيه السؤال الوحيد اللي لو اتحلّ هتبدأ؟' },
      ],
      cta: input.salesChannel === 'whatsapp' ? 'كلّمنا على واتساب دلوقتي' : 'ابدأ التسجيل',
      toneNotes: `استخدم ${input.tone} مع لمسة ثقة واحترام`,
    };
  },
};
