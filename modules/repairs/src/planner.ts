/**
 * Repair planner — PURE. Maps a leak (lane + code + evidence) to a structured
 * repair plan: a type, a risk level, and an ordered list of typed steps. Every
 * plan is grounded in the leak's observed evidence; if there's no evidence,
 * there's no plan. No step here mutates anything — execution happens elsewhere,
 * only after approval.
 */

export type RepairType =
  | 'payment_recovery' | 'whatsapp_first_reply' | 'whatsapp_followup' | 'page_cta_fix'
  | 'page_hero_fix' | 'tracking_fix' | 'followup_fix' | 'access_delivery_fix' | 'attribution_fix';

export type StepType =
  | 'create_task' | 'draft_whatsapp' | 'update_page_section' | 'update_offer'
  | 'update_payment_instruction' | 'create_tracked_link' | 'mark_leak_fixing'
  | 'open_filtered_view' | 'generate_report_note';

export interface PlannedStep {
  stepType: StepType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;   // true for mutations; false for navigation-only
}

export interface RepairPlanDraft {
  type: RepairType;
  title: string;
  explanation: string;
  riskLevel: 'low' | 'medium' | 'high';
  steps: PlannedStep[];
  affectedFilter?: string;   // lead filter the plan operates on (for counts/preview)
}

/** An alternative repair strategy, surfaced when the primary may be weak. */
export interface AlternativeStrategy {
  title: string;
  whenToUse: string;
  steps: { stepType: StepType; title: string }[];
}

/** Alternative strategies per repair type — used when learning suggests the
 *  primary tends not to move the metric, or when the user asks for a plan B. */
export const ALTERNATIVES: Partial<Record<RepairType, AlternativeStrategy>> = {
  payment_recovery: {
    title: 'تبسيط الدفع بدل التذكير',
    whenToUse: 'لو التذكيرات مش بتحرّك الدفع — بسّط التعليمات وقدّم طريقة دفع أسهل.',
    steps: [
      { stepType: 'update_payment_instruction', title: 'بسّط تعليمات الدفع' },
      { stepType: 'create_task', title: 'مهمة: ذكّر بإثبات التحويل' },
      { stepType: 'open_filtered_view', title: 'افتح العملاء المتأثرين' },
    ],
  },
  page_cta_fix: {
    title: 'إعادة كتابة الهيرو + إثبات جنب الـ CTA',
    whenToUse: 'لو تحسين الـ CTA لوحده مجابش ضغطات — اشتغل على الهيرو والإثبات.',
    steps: [
      { stepType: 'update_page_section', title: 'أعِد كتابة الهيرو' },
      { stepType: 'update_page_section', title: 'قوّي الإثبات جنب الـ CTA' },
    ],
  },
  whatsapp_first_reply: {
    title: 'تعديل النبرة وقالب الاعتراض',
    whenToUse: 'لو أول رد مش بيرجّع تفاعل — غيّر النبرة وحسّن قالب الاعتراض وتوقيت المتابعة.',
    steps: [
      { stepType: 'draft_whatsapp', title: 'مسودة بنبرة مختلفة' },
      { stepType: 'create_task', title: 'مهمة: متابعة بتوقيت مختلف' },
    ],
  },
  followup_fix: {
    title: 'تحديد الإجراء التالي صراحةً',
    whenToUse: 'لو المهام لوحدها مش بتتقفل — حدّد next_action واضح لكل عميل.',
    steps: [
      { stepType: 'open_filtered_view', title: 'افتح العملاء بدون إجراء تالي' },
      { stepType: 'create_task', title: 'مهمة: حدّد الخطوة الجاية' },
    ],
  },
};

export function alternativeFor(type: RepairType): AlternativeStrategy | null {
  return ALTERNATIVES[type] ?? null;
}

export interface LeakForPlan {
  code: string;
  lane: string;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  recommendedAction?: string;
}

const nav = (filter: string, title: string): PlannedStep => ({
  stepType: 'open_filtered_view', title, description: 'فتح العملاء المتأثرين', payload: { filter }, requiresConfirmation: false,
});
const markFixing = (): PlannedStep => ({
  stepType: 'mark_leak_fixing', title: 'علّم التسريب «قيد الإصلاح»', description: 'بعد موافقتك فقط', payload: {}, requiresConfirmation: true,
});

/**
 * Build a repair plan from a leak. Returns null if the leak carries no usable
 * evidence (no fabricated repairs).
 */
export function planRepair(leak: LeakForPlan): RepairPlanDraft | null {
  const ev = leak.evidence || {};
  const hasEvidence = ev && Object.keys(ev).length > 0;
  if (!hasEvidence) return null;

  // ---- PAYMENT lane ----
  if (leak.lane === 'payment') {
    if (leak.code === 'payment.waiting_stuck' || leak.code === 'payment.waiting_no_task' || leak.code === 'payment.details_no_waiting') {
      return {
        type: 'payment_recovery', riskLevel: 'low',
        title: 'إصلاح: متابعة العملاء المتوقّفين عند الدفع',
        explanation: `${leak.explanation} هنجهّز تذكير دفع ومهام متابعة — من غير إرسال تلقائي.`,
        affectedFilter: 'waiting_payment',
        steps: [
          nav('waiting_payment', 'افتح العملاء «بانتظار الدفع»'),
          { stepType: 'draft_whatsapp', title: 'جهّز تذكير دفع', description: 'مسودة تتنسخ وتتبعت يدويًا', payload: { objectionKey: undefined, stepType: 'payment_reminder' }, requiresConfirmation: false },
          { stepType: 'create_task', title: 'اعمل مهام متابعة الدفع', description: 'مهمة لكل عميل متأثر', payload: { filter: 'waiting_payment', title: 'تابع الدفع', kind: 'whatsapp_followup' }, requiresConfirmation: true },
          markFixing(),
        ],
      };
    }
    if (leak.code === 'payment.proof_not_reviewed' || leak.code === 'payment.proof_unconfirmed') {
      return {
        type: 'payment_recovery', riskLevel: 'low',
        title: 'إصلاح: مراجعة إثباتات التحويل',
        explanation: `${leak.explanation} هنعمل مهام مراجعة للإثباتات اللي لسه محدش راجعها.`,
        affectedFilter: 'proof_to_review',
        steps: [
          nav('proof_to_review', 'افتح العملاء اللي رفعوا إثبات'),
          { stepType: 'create_task', title: 'اعمل مهام مراجعة الإثبات', description: 'مهمة مراجعة لكل إثبات', payload: { filter: 'proof_to_review', title: 'راجِع إثبات الدفع', kind: 'proof_review' }, requiresConfirmation: true },
          markFixing(),
        ],
      };
    }
    if (leak.code === 'payment.confirmed_not_delivered' || leak.code === 'payment.paid_not_delivered') {
      return {
        type: 'access_delivery_fix', riskLevel: 'medium',
        title: 'إصلاح: تسليم الوصول للعملاء اللي دفعوا',
        explanation: `${leak.explanation} خطر على الثقة — هنعمل مهام تسليم فورية.`,
        affectedFilter: 'confirmed_not_delivered',
        steps: [
          nav('confirmed_not_delivered', 'افتح العملاء اللي دفعوا ولسه'),
          { stepType: 'create_task', title: 'اعمل مهام تسليم الوصول', description: 'مهمة تسليم لكل عميل', payload: { filter: 'confirmed_not_delivered', title: 'سلّم الوصول', kind: 'delivery' }, requiresConfirmation: true },
          markFixing(),
        ],
      };
    }
    if (leak.code === 'payment.no_method' || leak.code === 'payment.missing_instructions') {
      return {
        type: 'payment_recovery', riskLevel: 'low',
        title: 'إصلاح: تعليمات الدفع المحلية',
        explanation: `${leak.explanation} هنفتح تبويب الدفع لتجهيز التعليمات.`,
        steps: [
          { stepType: 'open_filtered_view', title: 'افتح تبويب الدفع', description: 'لإضافة/تحسين التعليمات', payload: { tab: 'payment' }, requiresConfirmation: false },
          { stepType: 'update_payment_instruction', title: 'حسّن تعليمات الدفع', description: 'مقترح يتطبّق بعد موافقتك', payload: {}, requiresConfirmation: true },
        ],
      };
    }
  }

  // ---- WHATSAPP lane ----
  if (leak.lane === 'whatsapp') {
    if (leak.code === 'whatsapp.no_contact' || leak.code === 'whatsapp.stuck_clicked' || leak.code === 'whatsapp.no_first_reply' || leak.code === 'whatsapp.clicked_no_reply') {
      return {
        type: 'whatsapp_first_reply', riskLevel: 'low',
        title: 'إصلاح: أول رد للعملاء اللي ضغطوا واتساب',
        explanation: `${leak.explanation} هنجهّز أول رد ومهام تواصل — من غير إرسال تلقائي.`,
        affectedFilter: 'clicked_not_contacted',
        steps: [
          nav('clicked_not_contacted', 'افتح اللي ضغطوا واتساب ومحدش كلمهم'),
          { stepType: 'draft_whatsapp', title: 'جهّز أول رد', description: 'مسودة تتنسخ وتتبعت يدويًا', payload: { stepType: 'first_reply' }, requiresConfirmation: false },
          { stepType: 'create_task', title: 'اعمل مهام تواصل', description: 'مهمة لكل عميل', payload: { filter: 'clicked_not_contacted', title: 'كلّم العميل', kind: 'whatsapp_first' }, requiresConfirmation: true },
          markFixing(),
        ],
      };
    }
    if (leak.code === 'whatsapp.no_followup' || leak.code === 'whatsapp.no_flow') {
      return {
        type: 'whatsapp_followup', riskLevel: 'low',
        title: 'إصلاح: متابعة واتساب',
        explanation: `${leak.explanation} هنفتح تبويب واتساب لتجهيز الـ flow/المتابعة.`,
        steps: [
          { stepType: 'open_filtered_view', title: 'افتح تبويب واتساب', description: 'لتجهيز الـ flow', payload: { tab: 'whatsapp' }, requiresConfirmation: false },
          { stepType: 'create_task', title: 'اعمل مهام متابعة', description: 'للعملاء المحتاجين متابعة', payload: { filter: 'needs_followup', title: 'تابع على واتساب', kind: 'whatsapp_followup' }, requiresConfirmation: true },
        ],
      };
    }
  }

  // ---- PAGE lane ----
  if (leak.lane === 'page') {
    if (leak.code === 'page.low_cta' || leak.code === 'page.price_not_reached') {
      return {
        type: 'page_cta_fix', riskLevel: 'medium',
        title: 'إصلاح: CTA صفحة الهبوط',
        explanation: `${leak.explanation} هنقترح CTA أقوى — يتطبّق بعد مراجعتك للـ diff.`,
        steps: [
          { stepType: 'update_page_section', title: 'حسّن قسم الـ CTA', description: 'preview diff قبل التطبيق', payload: { sectionType: 'cta', action: 'cta_whatsapp_first', label: 'CTA' }, requiresConfirmation: true },
          markFixing(),
        ],
      };
    }
    if (leak.code === 'page.no_views') {
      return {
        type: 'page_hero_fix', riskLevel: 'low',
        title: 'إصلاح: الصفحة مش بتجيب زيارات',
        explanation: `${leak.explanation} محتاجين تتبّع/نشر — هنفتح التتبّع.`,
        steps: [ { stepType: 'open_filtered_view', title: 'افتح التتبّع', description: 'انشر الصفحة وفعّل الروابط', payload: { tab: 'capture' }, requiresConfirmation: false } ],
      };
    }
  }

  // ---- TRACKING lane ----
  if (leak.lane === 'tracking') {
    const steps: PlannedStep[] = [{ stepType: 'open_filtered_view', title: 'افتح التتبّع', description: 'لإعداد الروابط/النشر', payload: { tab: 'capture' }, requiresConfirmation: false }];
    if (leak.code === 'tracking.no_links') {
      steps.push({ stepType: 'create_tracked_link', title: 'أنشئ رابط واتساب متتبَّع', description: 'لو فيه رقم وجهة', payload: {}, requiresConfirmation: true });
    }
    steps.push({ stepType: 'create_task', title: 'اعمل مهمة إعداد التتبّع', description: 'خطوة إعداد', payload: { filter: 'none', title: 'جهّز التتبّع', kind: 'setup', single: true }, requiresConfirmation: true });
    return {
      type: 'tracking_fix', riskLevel: 'low',
      title: 'إصلاح: التتبّع',
      explanation: `${leak.explanation} من غير تتبّع مش هنقدر نشخّص صح.`,
      steps,
    };
  }

  // ---- FOLLOWUP lane ----
  if (leak.lane === 'followup') {
    if (leak.code === 'followup.lost_no_reason') {
      return {
        type: 'followup_fix', riskLevel: 'low',
        title: 'إصلاح: أسباب خسارة العملاء',
        explanation: `${leak.explanation} هنفتح العملاء الخسرانين لتسجيل السبب ونتعلّم.`,
        affectedFilter: 'lost_no_reason',
        steps: [ nav('lost_no_reason', 'افتح العملاء الخسرانين') ],
      };
    }
    return {
      type: 'followup_fix', riskLevel: 'low',
      title: 'إصلاح: المتابعات المتأخرة',
      explanation: `${leak.explanation} هنعمل مهام متابعة للعملاء المحتاجين تحرّك.`,
      affectedFilter: 'needs_followup',
      steps: [
        nav('needs_followup', 'افتح العملاء المحتاجين متابعة'),
        { stepType: 'create_task', title: 'اعمل مهام متابعة', description: 'مهمة لكل عميل', payload: { filter: 'needs_followup', title: 'تابع العميل', kind: 'followup' }, requiresConfirmation: true },
      ],
    };
  }

  // ---- TRAFFIC lane (navigation-only guidance) ----
  if (leak.lane === 'traffic') {
    return {
      type: 'attribution_fix', riskLevel: 'low',
      title: 'إصلاح: جودة الترافيك/الإسناد',
      explanation: `${leak.explanation} هنفتح التتبّع لمراجعة المصادر.`,
      steps: [ { stepType: 'open_filtered_view', title: 'افتح التتبّع', description: 'راجِع المصادر والروابط', payload: { tab: 'capture' }, requiresConfirmation: false } ],
    };
  }

  return null;
}
