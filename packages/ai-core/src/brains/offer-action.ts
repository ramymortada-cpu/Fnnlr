import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { Offer } from '../contracts.js';

/**
 * OfferActionBrain — transforms an EXISTING offer according to a named action
 * (improve, make premium, rewrite in Egyptian/Gulf Arabic, strengthen objections,
 * improve CTA, soften, make high-ticket). Returns a PREVIEW offer; the caller
 * shows it and only persists on explicit user "apply" — never overwrites silently.
 */

export type OfferAction =
  | 'improve' | 'premium' | 'direct_response' | 'egyptian' | 'gulf'
  | 'strengthen_objections' | 'improve_cta' | 'soften' | 'high_ticket';

export interface OfferActionInput {
  offer: Offer;
  action: OfferAction;
}

const ACTION_INSTRUCTION: Record<OfferAction, string> = {
  improve: 'حسّن العرض كله: وضوح أكتر، قيمة أعلى، صياغة أقوى — مع الحفاظ على المعنى.',
  premium: 'اجعل العرض أكثر رقيًا وفخامة في النبرة والصياغة.',
  direct_response: 'اجعل العرض تسويق مباشر (direct response): وعد واضح، إلحاح، CTA حاسم.',
  egyptian: 'أعد الصياغة باللهجة المصرية الودودة الأصيلة (مش ترجمة).',
  gulf: 'أعد الصياغة باللهجة الخليجية المحترفة.',
  strengthen_objections: 'قوِّ قسم الاعتراضات وردودها — غطِّ أكتر اعتراضات شيوعًا بردود مقنعة.',
  improve_cta: 'حسّن الـ CTA فقط ليكون أوضح وأقوى وأنسب للقناة.',
  soften: 'اجعل النبرة أنعم وأقل إلحاحًا، مع الحفاظ على الإقناع.',
  high_ticket: 'ارفع العرض لمستوى high-ticket: قيمة أعلى، تموضع أقوى، تسعير وثقة مناسبين.',
};

export const OfferActionBrain: Brain<OfferActionInput, Offer> = {
  name: 'offer_action',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market offer editor for fnnlr.',
      'You receive an existing offer (JSON) and one transformation instruction.',
      'Apply ONLY that transformation; keep the rest faithful. Native Arabic, not translation.',
      'Return ONLY the full transformed offer as JSON with the same keys. No prose.',
    ].join(' ');
    const user = [
      `Instruction: ${ACTION_INSTRUCTION[input.action]}`,
      '',
      'Current offer JSON:',
      JSON.stringify(input.offer),
      '',
      'Return the full offer JSON with keys: name, promise, idealCustomer, mainPain, desiredResult,',
      'transformation, deliverables[], bonuses[], guarantee, pricing, paymentPlan, urgency,',
      'objections[]{objection,reply}, cta, toneNotes.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<Offer>;
    if (!o.name || !o.promise) throw new Error('OfferAction: missing name/promise');
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

  /**
   * Deterministic fallback when no LLM: apply a light, honest local transform so
   * the action still produces a visible, sensible preview (marked degraded).
   */
  fallback(input) {
    const o = { ...input.offer, objections: [...input.offer.objections] };
    switch (input.action) {
      case 'premium':
        o.toneNotes = (o.toneNotes ? o.toneNotes + ' · ' : '') + 'نبرة راقية وفخمة';
        o.promise = o.promise + ' — بمستوى وخدمة راقية';
        break;
      case 'direct_response':
        o.urgency = o.urgency || 'الأماكن محدودة — السعر يرتفع قريبًا';
        o.cta = 'احجز مكانك دلوقتي';
        break;
      case 'egyptian':
        o.toneNotes = 'لهجة مصرية ودودة أصيلة';
        break;
      case 'gulf':
        o.toneNotes = 'لهجة خليجية محترفة';
        break;
      case 'strengthen_objections':
        o.objections.push({ objection: 'الوقت مش مناسب', reply: 'نبدأ بخطوة صغيرة دلوقتي تناسب وقتك' });
        break;
      case 'improve_cta':
        o.cta = o.cta && o.cta.length > 0 ? o.cta + ' ✦' : 'ابدأ دلوقتي';
        break;
      case 'soften':
        o.urgency = '';
        o.toneNotes = (o.toneNotes ? o.toneNotes + ' · ' : '') + 'نبرة هادئة غير ملحّة';
        break;
      case 'high_ticket':
        o.toneNotes = (o.toneNotes ? o.toneNotes + ' · ' : '') + 'تموضع high-ticket';
        o.guarantee = o.guarantee || 'ضمان نتيجة واضح';
        break;
      case 'improve':
      default:
        o.promise = o.promise + ' (نسخة محسّنة)';
    }
    return o;
  },
};
