import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { OnboardingInput, FunnelBlueprint, FunnelType, FunnelStageSpec } from '../contracts.js';

/**
 * FunnelArchitectBrain — the heart of the product. Turns onboarding answers
 * into a complete, structured, editable funnel blueprint (not markdown).
 */
export const FunnelArchitectBrain: Brain<OnboardingInput, FunnelBlueprint> = {
  name: 'funnel_architect',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an elite Arab-market revenue strategist for fnnlr.',
      'You design WhatsApp-spined, local-payment-aware revenue funnels for Egypt and the Gulf.',
      'The sale usually closes in WhatsApp, not on a checkout page. Local manual payment is part of the funnel.',
      'Arabic dialect, trust, and tone are conversion assets — never generic translation.',
      'Return ONLY a JSON object matching the requested schema. No prose, no markdown fences.',
    ].join(' ');

    const user = [
      `Business: ${input.businessName}`,
      `Market: ${input.market}`,
      `Sells: ${input.sells} (type: ${input.productType})`,
      `Price: ${input.priceRange}`,
      `Target: ${input.targetCustomer}`,
      `Traffic: ${input.trafficSource}`,
      `Primary sales channel: ${input.salesChannel}`,
      `Payment methods: ${input.paymentMethods.join(', ')}`,
      `Tone: ${input.tone}`,
      `Goal: ${input.goal}`,
      input.playbookContext ? `\nLearning playbook context (use cautiously, do not overclaim): ${input.playbookContext}` : '',
      '',
      'Return JSON with keys: funnelType, objective, icpSummary, awarenessLevel, mainPromise,',
      'stages[] (each: name, purpose, channel, conversionEvent, assetsNeeded[], expectedLeak, trackingRequirement),',
      'whatsappRole, paymentRole, followupLogic, trackingRequirements[], expectedLeaks[], launchChecklist[],',
      'playbookNotes (short Arabic note on how learning shaped this funnel, or that data was limited).',
      'Choose funnelType from: click_to_whatsapp, lead_magnet, vsl, course_sales, high_ticket_consult,',
      'coaching_program, digital_product, paid_booking, manual_transfer, hybrid.',
    ].join('\n');

    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<FunnelBlueprint>;
    if (!o.funnelType || !Array.isArray(o.stages) || o.stages.length === 0) {
      throw new Error('FunnelArchitect: missing funnelType or stages');
    }
    // minimal shape guarantee
    return {
      funnelType: o.funnelType as FunnelType,
      objective: o.objective ?? '',
      icpSummary: o.icpSummary ?? '',
      awarenessLevel: o.awarenessLevel ?? '',
      mainPromise: o.mainPromise ?? '',
      stages: o.stages as FunnelStageSpec[],
      whatsappRole: o.whatsappRole ?? '',
      paymentRole: o.paymentRole ?? '',
      followupLogic: o.followupLogic ?? '',
      trackingRequirements: o.trackingRequirements ?? [],
      expectedLeaks: o.expectedLeaks ?? [],
      launchChecklist: o.launchChecklist ?? [],
      playbookNotes: (o as any).playbookNotes ?? undefined,
    };
  },

  /**
   * Deterministic fallback: a sensible WhatsApp-first funnel derived from the
   * inputs. Ensures the product produces a usable, editable blueprint even with
   * no LLM configured (marked degraded so the UI can show "draft — improve with AI").
   */
  fallback(input) {
    const whatsappFirst = input.salesChannel === 'whatsapp' || input.salesChannel === 'manual_transfer';
    const funnelType: FunnelType =
      input.productType === 'high_ticket' ? 'high_ticket_consult'
      : input.productType === 'course' ? 'course_sales'
      : whatsappFirst ? 'click_to_whatsapp'
      : 'hybrid';

    const stages: FunnelStageSpec[] = [
      { name: 'مصدر الزيارات', purpose: 'جذب العميل المناسب', channel: input.trafficSource,
        conversionEvent: 'tracked_link_click', assetsNeeded: ['إعلان', 'رابط متتبَّع'],
        expectedLeak: 'استهداف واسع/غير دقيق', trackingRequirement: 'tracked_link_click' },
      { name: 'صفحة الهبوط', purpose: 'توضيح العرض ودفع العميل للتواصل', channel: 'landing_page',
        conversionEvent: 'whatsapp_clicked', assetsNeeded: ['صفحة RTL', 'CTA واتساب'],
        expectedLeak: 'الصفحة طويلة أو CTA ضعيف', trackingRequirement: 'page_view, scroll_depth, cta_clicked' },
      { name: 'محادثة واتساب', purpose: 'تأهيل العميل والرد على الاعتراضات', channel: 'whatsapp',
        conversionEvent: 'price_sent', assetsNeeded: ['سكريبت بيع', 'ردود اعتراضات'],
        expectedLeak: 'بطء أول رد', trackingRequirement: 'message_received, first_reply_sent' },
      { name: 'الدفع', purpose: 'تحصيل الدفع المحلي وتأكيده', channel: 'payment',
        conversionEvent: 'payment_confirmed', assetsNeeded: input.paymentMethods,
        expectedLeak: 'توقف بعد إرسال تفاصيل الدفع', trackingRequirement: 'payment_details_sent, proof_uploaded' },
      { name: 'التسليم والمتابعة', purpose: 'تسليم المنتج ومتابعة العميل', channel: 'whatsapp',
        conversionEvent: 'access_delivered', assetsNeeded: ['رسالة تسليم', 'تسلسل متابعة'],
        expectedLeak: 'غياب المتابعة', trackingRequirement: 'access_delivered, followup_sent' },
    ];

    return {
      funnelType,
      objective: input.goal,
      icpSummary: input.targetCustomer,
      awarenessLevel: 'problem-aware',
      mainPromise: `حل ${input.sells} لـ ${input.targetCustomer}`,
      stages,
      whatsappRole: 'القناة الأساسية لإغلاق البيع',
      paymentRole: `دفع محلي عبر: ${input.paymentMethods.join('، ')}`,
      followupLogic: 'متابعة بعد السعر، بعد تفاصيل الدفع، وبعد الصمت — باحترام بدون زن',
      trackingRequirements: ['tracked_link_click', 'page_view', 'whatsapp_clicked', 'payment_details_sent'],
      expectedLeaks: ['بطء أول رد على واتساب', 'توقف بعد إرسال السعر', 'توقف بعد تفاصيل الدفع'],
      launchChecklist: ['انشر الصفحة', 'فعّل الرابط المتتبَّع', 'جهّز سكريبت واتساب', 'جهّز رسائل الدفع', 'فعّل المتابعة'],
      playbookNotes: input.playbookContext
        ? 'تم أخذ ملاحظات تعلّم fnnlr في الاعتبار عند بناء القمع.'
        : 'بيانات التعلّم لسه محدودة؛ تم استخدام هيكل قمع افتراضي.',
    };
  },
};
