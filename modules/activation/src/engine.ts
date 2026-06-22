/**
 * Activation engine — PURE. Turns observed configuration + signals into an
 * evidence-based activation path from setup to first live revenue signal.
 * Nothing here is a checkbox the user ticks; every step is `done` ONLY when the
 * underlying record/event actually exists. No demo data, no fake progress.
 */

export type StepStatus = 'not_started' | 'ready' | 'done' | 'blocked';

export type ActivationStepId =
  | 'business_created' | 'offer_defined' | 'funnel_blueprint_created'
  | 'page_created' | 'page_published'
  | 'tracked_whatsapp_link_created' | 'payment_method_configured'
  | 'first_page_view_seen' | 'first_whatsapp_click_seen'
  | 'first_lead_created' | 'first_payment_state_seen'
  | 'first_revenue_desk_item_seen' | 'first_recommendation_seen' | 'first_outcome_measured';

export type ActivationStage =
  | 'setup' | 'publish_ready' | 'traffic_ready' | 'lead_ready' | 'revenue_ops_ready' | 'learning_ready';

export interface ActivationEvidence {
  hasBusiness: boolean;
  hasOffer: boolean;
  hasBlueprint: boolean;      // funnel steps/blueprint defined
  hasPage: boolean;
  pagePublished: boolean;
  hasTrackedLink: boolean;
  hasPaymentMethod: boolean;
  pageViews: number;
  whatsappClicks: number;
  leads: number;
  paymentStates: number;
  revenueDeskItems: number;
  recommendations: number;
  outcomesMeasured: number;
}

export interface ActivationStep {
  id: ActivationStepId;
  label: string;          // Arabic
  status: StepStatus;
  evidence: string;       // plain-Arabic statement of what was (or wasn't) observed
  nextAction: string;
  route: string;
  section: 'setup' | 'publish' | 'first_signals' | 'revenue_operations';
}

const STEP_DEFS: { id: ActivationStepId; label: string; section: ActivationStep['section']; route: string; nextAction: string }[] = [
  { id: 'business_created', label: 'إنشاء البيزنس', section: 'setup', route: 'dashboard', nextAction: 'ابدأ بإنشاء البيزنس' },
  { id: 'offer_defined', label: 'تحديد العرض', section: 'setup', route: 'funnel', nextAction: 'حدّد العرض (الوعد، السعر، الباقة)' },
  { id: 'funnel_blueprint_created', label: 'بناء مخطط القمع', section: 'setup', route: 'funnel', nextAction: 'ابنِ مخطط القمع' },
  { id: 'page_created', label: 'إنشاء صفحة الهبوط', section: 'publish', route: 'funnel', nextAction: 'أنشئ صفحة الهبوط' },
  { id: 'page_published', label: 'نشر الصفحة', section: 'publish', route: 'funnel', nextAction: 'انشر الصفحة عشان تستقبل زيارات' },
  { id: 'tracked_whatsapp_link_created', label: 'رابط واتساب متتبَّع', section: 'publish', route: 'funnel', nextAction: 'أنشئ رابط واتساب متتبَّع' },
  { id: 'payment_method_configured', label: 'طريقة دفع', section: 'publish', route: 'funnel', nextAction: 'حدّد طريقة دفع وتعليماتها' },
  { id: 'first_page_view_seen', label: 'أول زيارة للصفحة', section: 'first_signals', route: 'funnel', nextAction: 'ابعت أول ترافيك للصفحة' },
  { id: 'first_whatsapp_click_seen', label: 'أول ضغطة واتساب', section: 'first_signals', route: 'funnel', nextAction: 'شارك رابط الواتساب' },
  { id: 'first_lead_created', label: 'أول عميل محتمل', section: 'first_signals', route: 'pipeline', nextAction: 'استقبل أول lead من تفاعل حقيقي' },
  { id: 'first_payment_state_seen', label: 'أول حالة دفع', section: 'revenue_operations', route: 'pipeline', nextAction: 'تابع أول حالة دفع' },
  { id: 'first_revenue_desk_item_seen', label: 'أول عنصر في مكتب الإيراد', section: 'revenue_operations', route: 'revenue-desk', nextAction: 'افتح مكتب الإيراد' },
  { id: 'first_recommendation_seen', label: 'أول توصية', section: 'revenue_operations', route: 'recommendations', nextAction: 'راجِع أول توصية' },
  { id: 'first_outcome_measured', label: 'أول قياس نتيجة', section: 'revenue_operations', route: 'recommendations', nextAction: 'قِس نتيجة أول إجراء' },
];

function statusFor(id: ActivationStepId, e: ActivationEvidence): { status: StepStatus; evidence: string } {
  const done = (cond: boolean, yes: string, no: string): { status: StepStatus; evidence: string } =>
    cond ? { status: 'done', evidence: yes } : { status: 'ready', evidence: no };
  switch (id) {
    case 'business_created': return done(e.hasBusiness, 'البيزنس موجود.', 'لسه مفيش بيزنس.');
    case 'offer_defined': return done(e.hasOffer, 'العرض متحدّد.', 'لسه مفيش عرض.');
    case 'funnel_blueprint_created': return done(e.hasBlueprint, 'مخطط القمع موجود.', 'لسه مفيش مخطط قمع.');
    case 'page_created': return done(e.hasPage, 'الصفحة موجودة.', 'لسه مفيش صفحة هبوط.');
    case 'page_published':
      if (e.pagePublished) return { status: 'done', evidence: 'الصفحة منشورة.' };
      return e.hasPage ? { status: 'ready', evidence: 'الصفحة موجودة بس مش منشورة.' } : { status: 'blocked', evidence: 'محتاج تعمل صفحة الأول.' };
    case 'tracked_whatsapp_link_created': return done(e.hasTrackedLink, 'رابط واتساب متتبَّع موجود.', 'لسه مفيش رابط واتساب متتبَّع.');
    case 'payment_method_configured': return done(e.hasPaymentMethod, 'طريقة الدفع متحدّدة.', 'لسه مفيش طريقة دفع.');
    case 'first_page_view_seen':
      if (e.pageViews > 0) return { status: 'done', evidence: `وصلت ${e.pageViews} زيارة.` };
      return e.pagePublished ? { status: 'ready', evidence: 'الصفحة منشورة — مستنيين أول زيارة.' } : { status: 'blocked', evidence: 'انشر الصفحة الأول.' };
    case 'first_whatsapp_click_seen':
      if (e.whatsappClicks > 0) return { status: 'done', evidence: `${e.whatsappClicks} ضغطة واتساب.` };
      return e.hasTrackedLink ? { status: 'ready', evidence: 'الرابط جاهز — مستنيين أول ضغطة.' } : { status: 'blocked', evidence: 'أنشئ رابط واتساب الأول.' };
    case 'first_lead_created':
      return e.leads > 0 ? { status: 'done', evidence: `${e.leads} عميل محتمل.` } : { status: 'ready', evidence: 'لسه مفيش leads.' };
    case 'first_payment_state_seen':
      return e.paymentStates > 0 ? { status: 'done', evidence: `${e.paymentStates} حالة دفع.` } : { status: 'ready', evidence: 'لسه مفيش حالات دفع.' };
    case 'first_revenue_desk_item_seen':
      return e.revenueDeskItems > 0 ? { status: 'done', evidence: `${e.revenueDeskItems} عنصر في المكتب.` } : { status: 'ready', evidence: 'مكتب الإيراد هيمتلي لما يبقى فيه نشاط حقيقي.' };
    case 'first_recommendation_seen':
      return e.recommendations > 0 ? { status: 'done', evidence: `${e.recommendations} توصية.` } : { status: 'ready', evidence: 'التوصيات بتظهر من نشاط مرصود.' };
    case 'first_outcome_measured':
      return e.outcomesMeasured > 0 ? { status: 'done', evidence: `${e.outcomesMeasured} نتيجة متقاسة.` } : { status: 'ready', evidence: 'لسه مفيش قياس نتائج.' };
  }
}

export function buildActivation(e: ActivationEvidence): {
  stage: ActivationStage;
  steps: ActivationStep[];
  readinessScore: number;
  launchReady: boolean;
  blockingReason: string | null;
  nextAction: ActivationStep | null;
} {
  const steps: ActivationStep[] = STEP_DEFS.map((d) => {
    const s = statusFor(d.id, e);
    return { id: d.id, label: d.label, section: d.section, route: d.route, nextAction: d.nextAction, status: s.status, evidence: s.evidence };
  });

  // stage is the furthest band fully satisfied by evidence
  const setupDone = e.hasBusiness && e.hasOffer && e.hasBlueprint;
  const publishReady = setupDone && e.hasPage;
  const published = publishReady && e.pagePublished && e.hasTrackedLink && e.hasPaymentMethod;
  const trafficReady = published && (e.pageViews > 0 || e.whatsappClicks > 0);
  const leadReady = trafficReady && e.leads > 0;
  const revenueOpsReady = leadReady && (e.revenueDeskItems > 0 || e.paymentStates > 0);
  const learningReady = revenueOpsReady && e.outcomesMeasured > 0;

  let stage: ActivationStage = 'setup';
  if (learningReady) stage = 'learning_ready';
  else if (revenueOpsReady) stage = 'revenue_ops_ready';
  else if (leadReady) stage = 'lead_ready';
  else if (trafficReady) stage = 'traffic_ready';
  else if (published) stage = 'publish_ready';
  else stage = 'setup';

  // launch readiness = published + tracked link + payment configured (can receive a real signal)
  const launchReady = published;
  const blockingReason = !setupDone ? 'كمّل الإعداد (بيزنس + عرض + مخطط قمع).'
    : !e.hasPage ? 'محتاج تعمل صفحة هبوط.'
    : !e.pagePublished ? 'الصفحة مش منشورة.'
    : !e.hasTrackedLink ? 'محتاج رابط واتساب متتبَّع.'
    : !e.hasPaymentMethod ? 'محتاج تحدّد طريقة دفع.'
    : null;

  // next action = first non-done step (in defined order)
  const nextAction = steps.find((s) => s.status !== 'done') ?? null;

  const doneCount = steps.filter((s) => s.status === 'done').length;
  const readinessScore = Math.round((doneCount / steps.length) * 100);

  return { stage, steps, readinessScore, launchReady, blockingReason, nextAction };
}
