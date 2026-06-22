import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { Offer, Market, Tone } from '../contracts.js';

/**
 * WhatsAppSalesBrain — builds a full WhatsApp SALES flow for a funnel: the
 * conversation stages and the message templates a seller uses by hand. This is
 * a Sales Copilot, NOT a bot: every template is human-approved, anti-spam aware
 * (no-zann), and never auto-sent. Fallback produces a practical flow with no LLM.
 */

export type StepType =
  | 'first_reply' | 'qualification' | 'need_discovery' | 'price_reveal'
  | 'objection' | 'payment_details' | 'payment_reminder' | 'proof_reminder'
  | 'confirmation' | 'delivery' | 'no_response' | 'recovery' | 'upsell';

export interface WhatsAppTemplate {
  stepType: StepType;
  title: string;
  body: string;
  triggerStage?: string;
  triggerPaymentState?: string;
  objectionKey?: string;
  tone?: string;
  delaySuggestion?: string;
  requiresApproval: boolean;
  paidTemplateRequired: boolean;
  noZannCooldownHours: number;
  whenToUse?: string;
  followupSuggestion?: string;
}

export interface WhatsAppFlow {
  strategy: string;
  toneNotes: string;
  handoffNotes: string;
  templates: WhatsAppTemplate[];
}

export interface WhatsAppSalesInput {
  funnelName: string;
  offer: Offer;
  market: Market;
  tone: Tone;
  price: string;
  salesChannel: string;
  playbookContext?: string | null;
}

const OBJECTIONS: { key: string; label: string }[] = [
  { key: 'price_high', label: 'السعر عالي' },
  { key: 'need_think', label: 'محتاج أفكر' },
  { key: 'call_later', label: 'هكلمك بعدين' },
  { key: 'not_sure', label: 'مش واثق' },
  { key: 'want_guarantee', label: 'عايز ضمان' },
  { key: 'no_time', label: 'مفيش وقت' },
  { key: 'ask_someone', label: 'هسأل حد' },
  { key: 'payment_hard', label: 'الدفع صعب' },
  { key: 'more_details', label: 'محتاج تفاصيل أكتر' },
];

export const WhatsAppSalesBrain: Brain<WhatsAppSalesInput, WhatsAppFlow> = {
  name: 'whatsapp_sales',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market WhatsApp sales copywriter for fnnlr.',
      'In Egypt/Gulf the sale often closes inside WhatsApp. Write a full sales conversation flow:',
      'first reply, qualification, need discovery, price reveal, objection replies, payment details,',
      'reminders, confirmation, delivery, no-response follow-up, lost-lead recovery, upsell.',
      'This is a human Sales Copilot — respectful, NEVER spammy (no-zann), never auto-sent.',
      'Native Arabic in the requested dialect. Return ONLY JSON, no prose.',
    ].join(' ');
    const user = [
      `Funnel: ${input.funnelName}`,
      `Offer: ${JSON.stringify(input.offer)}`,
      `Market: ${input.market} · Tone: ${input.tone} · Price: ${input.price}`,
      input.playbookContext ? `Learning playbook context (use cautiously): ${input.playbookContext}` : '',
      '',
      'Return JSON: strategy, toneNotes, handoffNotes,',
      'templates[] (each: stepType, title, body, triggerStage?, triggerPaymentState?, objectionKey?,',
      'tone?, delaySuggestion?, requiresApproval, paidTemplateRequired, noZannCooldownHours, whenToUse?, followupSuggestion?).',
      'Include first_reply, qualification, need_discovery, price_reveal, one objection per common objection,',
      'payment_details, payment_reminder, proof_reminder, confirmation, delivery, no_response, recovery, upsell.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<WhatsAppFlow>;
    if (!Array.isArray(o.templates) || o.templates.length === 0) throw new Error('WhatsAppSales: missing templates');
    return {
      strategy: o.strategy ?? '',
      toneNotes: o.toneNotes ?? '',
      handoffNotes: o.handoffNotes ?? '',
      templates: o.templates.map((t) => ({
        stepType: t.stepType, title: t.title ?? '', body: t.body ?? '',
        triggerStage: t.triggerStage, triggerPaymentState: t.triggerPaymentState, objectionKey: t.objectionKey,
        tone: t.tone, delaySuggestion: t.delaySuggestion,
        requiresApproval: t.requiresApproval ?? true,
        paidTemplateRequired: t.paidTemplateRequired ?? false,
        noZannCooldownHours: t.noZannCooldownHours ?? 24,
        whenToUse: t.whenToUse, followupSuggestion: t.followupSuggestion,
      })) as WhatsAppTemplate[],
    };
  },

  /** Practical full flow with no LLM (degraded). */
  fallback(input) {
    const o = input.offer;
    const price = input.price || 'السعر';
    const t = (stepType: StepType, title: string, body: string, extra: Partial<WhatsAppTemplate> = {}): WhatsAppTemplate => ({
      stepType, title, body, requiresApproval: true, paidTemplateRequired: false, noZannCooldownHours: 24, ...extra,
    });

    const templates: WhatsAppTemplate[] = [
      t('first_reply', 'أول رد', `أهلاً بيك 🙌 شكرًا إنك تواصلت بخصوص ${o.name}. ممكن أعرف اسمك وإيه اللي بتدوّر عليه بالظبط؟`,
        { triggerStage: 'whatsapp_clicked', delaySuggestion: 'فورًا', whenToUse: 'أول ما العميل يضغط واتساب' }),
      t('qualification', 'تأهيل', 'عشان أساعدك صح: إنت دلوقتي بتدوّر على حل لنفسك ولا لشغلك؟ وإيه أهم هدف عندك؟',
        { triggerStage: 'contacted' }),
      t('need_discovery', 'اكتشاف الاحتياج', `إيه أكتر حاجة بتقف قدامك في ${o.mainPain || 'اللي بتحاول توصله'}؟`,
        { triggerStage: 'qualified' }),
      t('price_reveal', 'كشف السعر', `بالنسبة لـ ${o.name}، الاستثمار ${price}${o.paymentPlan ? ' (' + o.paymentPlan + ')' : ''}. ده بيشمل ${(o.deliverables || []).join('، ') || 'كل المميزات'}.`,
        { triggerStage: 'qualified', whenToUse: 'بعد فهم الاحتياج' }),
      // objection library
      ...OBJECTIONS.map((ob) => t('objection', `اعتراض: ${ob.label}`, objectionReply(ob.key, o, price),
        { objectionKey: ob.key, whenToUse: `لما العميل يقول «${ob.label}»`, followupSuggestion: 'تابع بعد يوم لو مفيش رد' })),
      t('payment_details', 'تفاصيل الدفع', `تمام! تقدر تدفع ${price} وأبعتلك تفاصيل الدفع المتاحة. تحب تدفع بأنهي طريقة؟`,
        { triggerStage: 'price_sent', triggerPaymentState: 'payment_details_sent' }),
      t('payment_reminder', 'تذكير الدفع', 'تذكير بسيط 🌟 لسه مستنيين دفعتك عشان نبدأ. لو عندك أي سؤال أنا موجود.',
        { triggerPaymentState: 'waiting_payment', delaySuggestion: 'بعد يوم', followupSuggestion: 'مرة واحدة بس باحترام' }),
      t('proof_reminder', 'تذكير الإثبات', 'لو حوّلت بالفعل، ابعتلي صورة التحويل وأأكّدلك على طول 🙏',
        { triggerPaymentState: 'waiting_payment' }),
      t('confirmation', 'تأكيد الدفع', 'وصلني التحويل ✅ أهلاً بيك معانا! بجهّزلك الوصول دلوقتي.',
        { triggerPaymentState: 'confirmed' }),
      t('delivery', 'تسليم الوصول', 'اتفعّل وصولك 🎉 دي بياناتك. لو احتجت أي مساعدة أنا في خدمتك.',
        { triggerPaymentState: 'access_delivered' }),
      t('no_response', 'متابعة بعد صمت', 'مريت عليك بس 🌟 لو لسه مهتم بـ ' + o.name + ' أنا موجود لأي سؤال — من غير أي ضغط.',
        { delaySuggestion: 'بعد يومين', noZannCooldownHours: 48, followupSuggestion: 'مرة كل يومين بحد أقصى' }),
      t('recovery', 'استرداد عميل متوقف', 'حابب أتأكد إننا ما قصّرناش معاك 🙏 لو فيه حاجة وقفتك خليني أساعدك فيها.',
        { triggerStage: 'lost', delaySuggestion: 'بعد ٣–٥ أيام', noZannCooldownHours: 72 }),
      t('upsell', 'عرض إضافي', 'بما إنك بدأت معانا، فيه خطوة جاية ممكن تفيدك أكتر — تحب أحكيلك عنها؟',
        { triggerStage: 'access_delivered', delaySuggestion: 'بعد أسبوع' }),
    ];

    return {
      strategy: input.salesChannel === 'whatsapp'
        ? 'البيع بيتقفل على واتساب: رد سريع، تأهيل، كشف سعر واضح، رد على الاعتراضات، ثم دفع محلي ومتابعة محترمة.'
        : 'واتساب قناة دعم للإغلاق بجانب الصفحة.',
      toneNotes: `استخدم ${input.tone} مع احترام وثقة. ابعد عن الإلحاح.`,
      handoffNotes: 'حوّل لإنسان فورًا لو العميل طلب، أو لو فيه اعتراض حسّاس أو شكوى.',
      templates,
    };
  },
};

function objectionReply(key: string, o: Offer, price: string): string {
  switch (key) {
    case 'price_high': return `أفهم إن ${price} مبلغ مهم. خلّينا نشوف القيمة اللي هتاخدها مقابله — ${o.desiredResult || 'النتيجة'} تستاهل أكتر. وفيه خطة دفع لو هتسهّل عليك.`;
    case 'need_think': return 'تمام تمام، خد وقتك 🙏 بس قولّي إيه السؤال الوحيد اللي لو اتحلّ هتبدأ؟';
    case 'call_later': return 'ماشي! تحب أكلمك إمتى بالظبط عشان ما أزعجكش؟';
    case 'not_sure': return `طبيعي تتردّد. عندنا ${o.guarantee || 'ضمان واضح'} وتجارب ناس زيّك بالظبط نجحوا.`;
    case 'want_guarantee': return `أكيد — ${o.guarantee || 'فيه ضمان يحميك'}. هدفنا نتيجتك مش مجرد بيع.`;
    case 'no_time': return 'نقدر نبدأ بخطوة صغيرة تناسب وقتك، ونمشي على راحتك.';
    case 'ask_someone': return 'تمام، استشير اللي تثق فيه. تحب أبعتلك ملخص بسيط يسهّل عليك الكلام معاهم؟';
    case 'payment_hard': return 'مفيش مشكلة خالص — عندنا طرق دفع محلية كتير (إنستاباي، فودافون كاش، تحويل بنكي) ونلاقي اللي يناسبك.';
    case 'more_details': return `بكل سرور! إيه بالظبط اللي حابب تعرف تفاصيل أكتر عنه في ${o.name}؟`;
    default: return 'قولّي قلقك بالظبط وأنا أوضّحلك 🙏';
  }
}
