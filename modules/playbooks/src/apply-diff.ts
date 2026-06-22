/**
 * Playbook application diff — PURE. Compares an existing funnel's current object
 * state against what a playbook recommends, and emits typed change steps with
 * before/after. Never deletes user content: changes are additive or reorder/copy
 * improvements. Low-confidence changes are flagged so they require an explicit ok.
 */

import type { PlaybookType } from './builder.js';

export type ObjectType = 'offer' | 'page' | 'whatsapp' | 'payment' | 'followup' | 'funnel';

export interface ChangeStep {
  objectType: ObjectType;
  objectId?: string | null;
  changeType: string;
  title: string;
  explanation: string;
  before: unknown;
  after: unknown;
  requiresConfirmation: boolean;
  lowConfidence: boolean;
}

export interface PlaybookForApply {
  playbookType: PlaybookType;
  confidence: 'low' | 'medium' | 'high';
  limited: boolean;
  adjustments: string[];
  note: string;
}

export interface CurrentState {
  offer?: { cta?: string; guarantee?: string; objections?: { objection: string; reply: string }[]; paymentPlan?: string } | null;
  pageSections?: { id: string; type: string; position: number; ctaTarget?: string }[];
  whatsappTemplates?: { id: string; stepType: string }[];
  paymentMethods?: { id: string; method: string; instructions?: string }[];
  funnelStages?: { id: string; name: string; trackingRequirement?: string }[];
}

const LOW_CONF_NOTE = 'بيانات التعلّم محدودة؛ ده تحسين افتراضي — محتاج موافقتك الصريحة.';

/**
 * Build the change steps for one playbook type against the current state.
 * Returns [] when there's nothing meaningful to change (so a plan is only
 * created when it adds value).
 */
export function diffPlaybook(pb: PlaybookForApply, state: CurrentState): ChangeStep[] {
  const steps: ChangeStep[] = [];
  const low = pb.confidence === 'low' || pb.limited;
  const mk = (objectType: ObjectType, changeType: string, title: string, explanation: string, before: unknown, after: unknown, objectId?: string | null): ChangeStep => ({
    objectType, objectId: objectId ?? null, changeType, title,
    explanation: low ? `${explanation} (${LOW_CONF_NOTE})` : explanation,
    before, after, requiresConfirmation: true, lowConfidence: low,
  });

  if (pb.playbookType === 'offer' && state.offer) {
    const o = state.offer;
    // add a missing risk-reversal / guarantee mention (additive, never overwrite if present)
    if (!o.guarantee || o.guarantee.trim() === '') {
      steps.push(mk('offer', 'add_guarantee', 'أضِف ضمان/عكس مخاطرة', 'العرض من غير ضمان واضح — هنقترح صيغة ضمان.', { guarantee: o.guarantee ?? '' }, { guarantee: 'ضمان استرجاع لو ماوصلتش النتيجة المتفق عليها.' }));
    }
    // suggest a payment-plan framing if absent
    if (!o.paymentPlan || o.paymentPlan.trim() === '') {
      steps.push(mk('offer', 'add_payment_plan', 'أضِف صيغة تقسيط/دفعات', 'مفيش صيغة دفعات — ممكن تقلّل friction الدفع.', { paymentPlan: o.paymentPlan ?? '' }, { paymentPlan: 'إمكانية الدفع على دفعتين عبر الطرق المحلية.' }));
    }
  }

  if (pb.playbookType === 'page' && state.pageSections && state.pageSections.length) {
    const secs = [...state.pageSections].sort((a, b) => a.position - b.position);
    const order = secs.map((s) => s.type);
    // recommend WhatsApp CTA earlier if it sits after pricing
    const ctaIdx = order.findIndex((t) => t === 'cta_whatsapp');
    const priceIdx = order.findIndex((t) => t === 'pricing');
    if (ctaIdx > -1 && priceIdx > -1 && ctaIdx > priceIdx) {
      const newOrder = secs.map((s) => s.id);
      // move cta_whatsapp just before pricing (no deletion)
      const cta = secs[ctaIdx]; newOrder.splice(ctaIdx, 1); newOrder.splice(priceIdx, 0, cta.id);
      steps.push(mk('page', 'reorder_sections', 'قدّم CTA واتساب قبل السعر', 'تقديم الـ CTA قبل السعر بيقلّل التسرّب.', { order }, { orderedIds: newOrder }));
    }
    // add proof near CTA if there's no proof section
    if (!order.includes('proof')) {
      steps.push(mk('page', 'add_proof_section', 'أضِف قسم إثبات قبل الـ CTA', 'مفيش قسم إثبات — الإثبات بيرفع الثقة قبل الضغط.', { hasProof: false }, { addSection: 'proof' }));
    }
    // add FAQ objections if missing
    if (!order.includes('faq')) {
      steps.push(mk('page', 'add_faq_section', 'أضِف FAQ للاعتراضات', 'مفيش FAQ — معالجة الاعتراضات بتقلّل التردد.', { hasFaq: false }, { addSection: 'faq' }));
    }
  }

  if (pb.playbookType === 'whatsapp') {
    const templates = state.whatsappTemplates ?? [];
    const has = (t: string) => templates.some((x) => x.stepType === t);
    if (!has('payment_reminder')) {
      steps.push(mk('whatsapp', 'add_template', 'أضِف قالب تذكير دفع', 'مفيش قالب تذكير دفع جاهز.', { hasTemplate: false }, { addTemplate: 'payment_reminder' }));
    }
    if (!has('proof_reminder')) {
      steps.push(mk('whatsapp', 'add_template', 'أضِف قالب تذكير بإثبات التحويل', 'مفيش قالب تذكير بالإثبات.', { hasTemplate: false }, { addTemplate: 'proof_reminder' }));
    }
  }

  if (pb.playbookType === 'payment' && state.paymentMethods && state.paymentMethods.length) {
    const methods = state.paymentMethods;
    // suggest method priority: prefer instapay/wallet first if present but not first
    const order = methods.map((m) => m.method);
    const fastIdx = order.findIndex((m) => m === 'instapay' || m === 'vodafone_cash');
    if (fastIdx > 0) {
      steps.push(mk('payment', 'reprioritize_methods', 'قدّم InstaPay/المحفظة كأولوية', 'الطرق الفورية بتقلّل friction الدفع.', { order }, { priorityFirst: order[fastIdx] }));
    }
    // proof reminder step if instructions don't mention proof
    const m0 = methods[0];
    if (m0 && (!m0.instructions || !/إثبات|proof|اسكرين|صورة/i.test(m0.instructions))) {
      steps.push(mk('payment', 'add_proof_reminder', 'أضِف خطوة طلب إثبات التحويل', 'إضافة طلب الإثبات بيقلّل التوقّف عند الدفع.', { methodId: m0.id, hasProof: false }, { addProofStep: true }, m0.id));
    }
  }

  if (pb.playbookType === 'followup') {
    // funnel-level: ensure a next-action default task template suggestion exists
    steps.push(mk('followup', 'add_next_action_default', 'حدّد إجراء تالي افتراضي للعملاء بدون تحرّك', 'تحديد الخطوة الجاية بيقلّل التوقّف.', { hasDefault: false }, { addDefault: 'تابع العميل خلال 24 ساعة' }));
  }

  if (pb.playbookType === 'funnel' && state.funnelStages && state.funnelStages.length) {
    const stages = state.funnelStages;
    const names = stages.map((s) => s.name);
    // add a Proof Reminder stage if absent (common manual-payment prevention)
    if (!names.some((n) => /إثبات|proof|تذكير الدفع/i.test(n))) {
      steps.push(mk('funnel', 'add_stage', 'أضِف مرحلة «تذكير الدفع/الإثبات»', 'قماقم الدفع اليدوي بتتسرّب عند الإثبات — مرحلة مخصّصة بتمسكها.', { stages: names }, { addStage: 'تذكير الدفع والإثبات' }));
    }
    // ensure tracking requirement noted on a stage without one
    const untracked = stages.find((s) => !s.trackingRequirement || s.trackingRequirement.trim() === '');
    if (untracked) {
      steps.push(mk('funnel', 'add_tracking_requirement', `أضِف متطلب تتبّع لمرحلة «${untracked.name}»`, 'من غير تتبّع مش هنقدر نشخّص المرحلة دي.', { stageId: untracked.id, tracking: '' }, { stageId: untracked.id, tracking: 'event_tracking' }, untracked.id));
    }
  }

  return steps;
}

/** Risk level for the whole plan from its steps. */
export function planRisk(steps: ChangeStep[]): 'low' | 'medium' | 'high' {
  if (steps.some((s) => s.changeType === 'reorder_sections' || s.changeType === 'reprioritize_methods')) return 'medium';
  return 'low';
}
