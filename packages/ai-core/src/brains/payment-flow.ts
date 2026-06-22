import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { Offer, Market, PaymentMethod, Tone } from '../contracts.js';

/**
 * PaymentFlowBrain — generates the customer-facing copy for a local payment
 * method as STRUCTURED records (instructions, WhatsApp message, proof steps,
 * confirmation, reminder, stuck follow-up, delivery, reassurance).
 *
 * Local payment in Egypt/Gulf is a JOURNEY, not a button — this brain treats it
 * that way. Fallback uses market-aware templates so it works with no LLM.
 */

export interface PaymentFlowInput {
  offer: Offer;
  price: string;
  market: Market;
  method: PaymentMethod;
  tone: Tone;
  accountDetails?: string;
  playbookContext?: string | null;
}

export interface PaymentFlowCopy {
  customerInstructions: string;
  whatsappMessage: string;
  proofInstructions: string;
  confirmationMessage: string;
  reminderMessage: string;
  stuckFollowupMessage: string;
  deliveryMessage: string;
  reassuranceNote: string;
}

const METHOD_AR: Record<string, string> = {
  instapay: 'إنستاباي', vodafone_cash: 'فودافون كاش', bank_transfer: 'تحويل بنكي',
  paymob: 'Paymob', fawry: 'فوري', tap: 'Tap', hyperpay: 'HyperPay', moyasar: 'Moyasar',
  stripe: 'Stripe', manual_proof: 'إثبات يدوي', payment_link: 'رابط دفع',
};

export const PaymentFlowBrain: Brain<PaymentFlowInput, PaymentFlowCopy> = {
  name: 'payment_flow',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market payment-flow copywriter for fnnlr.',
      'Local payment (InstaPay, Vodafone Cash, Fawry, bank transfer, Tap, etc.) is a guided journey:',
      'details → transfer → proof/screenshot → review → confirm → deliver, with reassurance and follow-up.',
      'Write clear, trustworthy Arabic copy in the requested dialect. Return ONLY JSON, no prose.',
    ].join(' ');
    const user = [
      `Method: ${input.method} (${METHOD_AR[input.method] ?? input.method})`,
      `Offer: ${input.offer.name} · Price: ${input.price} · Market: ${input.market} · Tone: ${input.tone}`,
      `Account/link details: ${input.accountDetails ?? '(to be filled by the seller)'}`,
      input.playbookContext ? `Learning playbook context (use cautiously): ${input.playbookContext}` : '',
      '',
      'Return JSON with keys: customerInstructions, whatsappMessage, proofInstructions,',
      'confirmationMessage, reminderMessage, stuckFollowupMessage, deliveryMessage, reassuranceNote.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<PaymentFlowCopy>;
    if (!o.customerInstructions || !o.whatsappMessage) throw new Error('PaymentFlow: missing core copy');
    return {
      customerInstructions: o.customerInstructions,
      whatsappMessage: o.whatsappMessage,
      proofInstructions: o.proofInstructions ?? '',
      confirmationMessage: o.confirmationMessage ?? '',
      reminderMessage: o.reminderMessage ?? '',
      stuckFollowupMessage: o.stuckFollowupMessage ?? '',
      deliveryMessage: o.deliveryMessage ?? '',
      reassuranceNote: o.reassuranceNote ?? '',
    };
  },

  /** Market-aware template fallback — practical copy with no LLM. */
  fallback(input) {
    const m = METHOD_AR[input.method] ?? input.method;
    const acct = input.accountDetails || '(هيتحط هنا رقم/حساب/رابط الدفع)';
    const price = input.price || 'المبلغ';
    return {
      customerInstructions:
        `للدفع عن طريق ${m}:\n١) حوّل ${price} على: ${acct}\n٢) صوّر إثبات التحويل (سكرين شوت)\n٣) ابعتلنا الصورة هنا على واتساب وهنأكّدلك ونبعتلك الوصول.`,
      whatsappMessage:
        `تمام! 🙌 للتأكيد، تقدر تدفع ${price} عن طريق ${m} على: ${acct}\nوابعتلي صورة التحويل وأنا أأكّدلك على طول.`,
      proofInstructions: 'ابعت سكرين شوت واضح لتأكيد التحويل (التاريخ والمبلغ ظاهرين).',
      confirmationMessage: 'وصلني التحويل ✅ أهلاً بيك! بجهّزلك الوصول دلوقتي.',
      reminderMessage: `تذكير بسيط 🌟 لسه مستنيين تحويلك عن طريق ${m} عشان نبدأ معاك.`,
      stuckFollowupMessage: 'لو واجهتك أي مشكلة في الدفع قولي، ونلاقيلك حل يناسبك — مفيش أي ضغط.',
      deliveryMessage: 'اتفعّل وصولك 🎉 دي بياناتك/اللينك. لو احتجت أي حاجة أنا موجود.',
      reassuranceNote: 'الدفع المحلي آمن ومضمون، وبنأكّد كل تحويل يدوي قبل التسليم.',
    };
  },
};

/** Market → suggested methods (templates) for quick setup. */
export function suggestedMethods(market: Market): PaymentMethod[] {
  if (market === 'sa' || market === 'ae' || market === 'gulf') {
    return ['tap', 'hyperpay', 'moyasar', 'bank_transfer', 'stripe'];
  }
  return ['instapay', 'vodafone_cash', 'bank_transfer', 'paymob', 'fawry'];
}
