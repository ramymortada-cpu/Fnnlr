/**
 * Leak detection engine — PURE functions. Takes a snapshot of OBSERVED funnel
 * data and returns findings, each grounded in evidence. This is the moat:
 * "fnnlr doesn't just build the funnel — it sees where revenue leaks."
 *
 * Hard rule: no finding without evidence drawn from observed events/records.
 * If there isn't enough observed data for a lane, we say so explicitly instead
 * of fabricating a leak or a money number.
 */

export type Lane = 'traffic' | 'page' | 'whatsapp' | 'payment' | 'followup' | 'tracking';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';

export interface LeakFinding {
  code: string;               // stable detector id (for upsert/dedup)
  lane: Lane;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;   // always populated — no evidence, no finding
  severity: Severity;
  confidence: Confidence;
  moneyImpact: number | null;          // null = insufficient revenue data (never fabricated)
  fastestFix: string;
  recommendedAction: string;
}

/** The observed snapshot the engine reasons over. All from real records/events. */
export interface FunnelSnapshot {
  hasTrackedLinks: boolean;
  linksCount: number;
  linksWithoutUtm: number;
  inactiveLinkInUse: boolean;
  totalClicks: number;
  leadsCount: number;
  leadsWithoutAttribution: number;
  pagePublished: boolean;
  pageViews: number;
  scrollReached50: number;       // count of visitors who passed 50% depth
  priceReached: number;
  ctaClicks: number;
  whatsappClicks: number;
  pageUsesTrackedLink: boolean;
  // pipeline
  leadsByStage: Record<string, number>;
  leadsStuckWhatsappClicked: number;   // in whatsapp_clicked > threshold time
  conversationsWithoutContact: number;
  leadsWithoutNextAction: number;
  // whatsapp flow (Sprint 10 enrichment)
  hasWhatsappFlow: boolean;
  hasFirstReplyTemplate: boolean;
  hasFollowupTemplate: boolean;
  clickedNoReplySent: number;       // leads in whatsapp_clicked with no reply marked sent
  waitingPaymentCount: number;
  waitingPaymentStuck: number;         // waiting payment > threshold time
  proofUploadedNotConfirmed: number;
  paidNotDelivered: number;
  paymentStuckCount: number;
  // payment flow config (Sprint 9 enrichment)
  hasPaymentMethod: boolean;
  paymentMethodsMissingInstructions: number;
  proofRequiredNoProofStep: number;
  proofUploadedNotReviewed: number;
  confirmedNotDelivered: number;
  inactiveMethodInUse: boolean;
  detailsSentNoWaiting: number;
  waitingNoFollowupTask: number;
  // follow-up
  overdueTasks: number;
  leadsNeedingFollowupNoDate: number;
  lostWithoutReason: number;
  highRiskNoAction: number;
  // revenue hint (for money impact; null when unknown)
  avgDealValue: number | null;
}

const MIN_SIGNAL = 1; // a lane needs at least this much observed signal to judge

/** Is there enough observed data to diagnose at all? */
export function hasEnoughData(s: FunnelSnapshot): boolean {
  return s.totalClicks > 0 || s.pageViews > 0 || s.leadsCount > 0;
}

function money(s: FunnelSnapshot, lostUnits: number): number | null {
  if (s.avgDealValue == null || s.avgDealValue <= 0 || lostUnits <= 0) return null;
  return Math.round(s.avgDealValue * lostUnits);
}

/** Run all detectors. Returns findings (possibly empty) — never fabricated. */
export function detectLeaks(s: FunnelSnapshot): LeakFinding[] {
  const f: LeakFinding[] = [];

  // ---- TRACKING (meta-lane: can we even diagnose?) ----
  if (!s.hasTrackedLinks) {
    f.push({
      code: 'tracking.no_links', lane: 'tracking',
      title: 'مفيش روابط واتساب متتبَّعة',
      explanation: 'القمع مالوش أي رابط متتبَّع، فمفيش طريقة نعرف بيها مصدر العملاء أو نرصد الضغطات.',
      evidence: { linksCount: s.linksCount },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'أنشئ رابط واتساب متتبَّع من تبويب التتبّع',
      recommendedAction: 'create_tracked_link',
    });
  }
  if (s.pagePublished && !s.pageUsesTrackedLink && s.hasTrackedLinks) {
    f.push({
      code: 'tracking.page_no_link', lane: 'tracking',
      title: 'الصفحة المنشورة مش مربوطة برابط متتبَّع',
      explanation: 'الصفحة منشورة لكن زر واتساب مش بيمرّ على رابط متتبَّع، فالضغطات مش بتتسجّل كـ leads.',
      evidence: { pagePublished: true, pageUsesTrackedLink: false },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'اربط زر واتساب في الصفحة برابط متتبَّع',
      recommendedAction: 'open_capture',
    });
  }
  if (s.linksWithoutUtm > 0) {
    f.push({
      code: 'tracking.links_no_utm', lane: 'tracking',
      title: 'روابط بدون UTM',
      explanation: 'فيه روابط من غير مصدر/حملة، فالـ attribution هيبقى ناقص.',
      evidence: { linksWithoutUtm: s.linksWithoutUtm },
      severity: 'low', confidence: 'medium', moneyImpact: null,
      fastestFix: 'أضف source/campaign للروابط',
      recommendedAction: 'open_capture',
    });
  }
  if (s.leadsWithoutAttribution > 0 && s.leadsCount > 0) {
    f.push({
      code: 'tracking.leads_no_attribution', lane: 'tracking',
      title: 'عملاء بدون مصدر معروف',
      explanation: `${s.leadsWithoutAttribution} من ${s.leadsCount} عميل من غير attribution.`,
      evidence: { leadsWithoutAttribution: s.leadsWithoutAttribution, leadsCount: s.leadsCount },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'استخدم روابط متتبَّعة بـ UTM لكل مصدر',
      recommendedAction: 'open_capture',
    });
  }

  // ---- TRAFFIC ----
  if (s.hasTrackedLinks && s.totalClicks === 0) {
    f.push({
      code: 'traffic.links_no_clicks', lane: 'traffic',
      title: 'روابط بدون أي ضغطات',
      explanation: 'عندك روابط متتبَّعة لكن لسه مفيش ضغطات — مفيش زيارات داخلة للقمع.',
      evidence: { linksCount: s.linksCount, totalClicks: 0 },
      severity: 'medium', confidence: 'high', moneyImpact: null,
      fastestFix: 'انشر الرابط في الإعلان/البايو/الصفحة',
      recommendedAction: 'open_capture',
    });
  }
  if (s.totalClicks >= MIN_SIGNAL && s.leadsCount === 0) {
    f.push({
      code: 'traffic.clicks_no_leads', lane: 'traffic',
      title: 'ضغطات من غير عملاء',
      explanation: `${s.totalClicks} ضغطة لكن مفيش leads اتسجّلت — يمكن مشكلة في الرابط أو الوجهة.`,
      evidence: { totalClicks: s.totalClicks, leadsCount: 0 },
      severity: 'high', confidence: 'medium', moneyImpact: null,
      fastestFix: 'اتأكد إن الرابط نشط ووجهته صح',
      recommendedAction: 'open_capture',
    });
  }

  // ---- PAGE ----
  if (s.pagePublished && s.pageViews === 0) {
    f.push({
      code: 'page.no_views', lane: 'page',
      title: 'الصفحة منشورة بدون زيارات',
      explanation: 'الصفحة منشورة لكن مفيش page views — محتاجة ترويج أو رابط.',
      evidence: { pageViews: 0 },
      severity: 'medium', confidence: 'high', moneyImpact: null,
      fastestFix: 'وجّه زيارات للصفحة عبر رابط متتبَّع',
      recommendedAction: 'open_capture',
    });
  }
  if (s.pageViews >= 10 && s.ctaClicks / Math.max(s.pageViews, 1) < 0.1) {
    f.push({
      code: 'page.low_cta', lane: 'page',
      title: 'نسبة الضغط على CTA ضعيفة',
      explanation: `الصفحة عليها ${s.pageViews} زيارة لكن ${s.ctaClicks} ضغطة CTA فقط — أقل من 10%.`,
      evidence: { pageViews: s.pageViews, ctaClicks: s.ctaClicks, rate: +(s.ctaClicks / s.pageViews).toFixed(2) },
      severity: 'high', confidence: 'medium', moneyImpact: null,
      fastestFix: 'قوِّ الـ hero وخلّي CTA واتساب أوضح وأعلى في الصفحة',
      recommendedAction: 'open_page',
    });
  }
  if (s.pageViews >= 10 && s.priceReached / Math.max(s.pageViews, 1) < 0.3) {
    f.push({
      code: 'page.price_not_reached', lane: 'page',
      title: 'أغلب الزوار مش بيوصلوا للسعر',
      explanation: `${s.priceReached} من ${s.pageViews} زائر وصلوا لقسم السعر فقط.`,
      evidence: { pageViews: s.pageViews, priceReached: s.priceReached },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'اختصر الصفحة وقرّب قسم العرض/السعر',
      recommendedAction: 'open_page',
    });
  }

  // ---- WHATSAPP ----
  if (s.leadsStuckWhatsappClicked > 0) {
    const lost = s.leadsStuckWhatsappClicked;
    f.push({
      code: 'whatsapp.stuck_clicked', lane: 'whatsapp',
      title: 'عملاء ضغطوا واتساب وعالقين',
      explanation: `${lost} عميل لسه في مرحلة «ضغط واتساب» من غير تحرّك — يمكن بطء أول رد.`,
      evidence: { stuck: lost, stage: 'whatsapp_clicked' },
      severity: lost >= 5 ? 'high' : 'medium', confidence: 'high', moneyImpact: money(s, lost),
      fastestFix: 'فعّل رد أول سريع وكلّم العملاء دول',
      recommendedAction: 'open_leads:clicked_not_contacted',
    });
  }
  if (s.conversationsWithoutContact > 0) {
    f.push({
      code: 'whatsapp.no_contact', lane: 'whatsapp',
      title: 'محادثات بدون تواصل',
      explanation: `${s.conversationsWithoutContact} محادثة اتفتحت من غير ما العميل يتعلّم عليه «تم التواصل».`,
      evidence: { conversationsWithoutContact: s.conversationsWithoutContact },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'علّم العملاء اللي اتكلّمت معاهم كـ «تم التواصل»',
      recommendedAction: 'open_leads:clicked_not_contacted',
    });
  }
  // ---- whatsapp FLOW leaks (Sprint 10) ----
  if (!s.hasWhatsappFlow && (s.whatsappClicks > 0 || s.leadsCount > 0)) {
    f.push({
      code: 'whatsapp.no_flow', lane: 'whatsapp',
      title: 'مفيش WhatsApp sales flow',
      explanation: 'القمع مالوش flow مبيعات على واتساب، فالفريق بيرتجل الردود.',
      evidence: { hasWhatsappFlow: false },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'ولّد WhatsApp flow من تبويب واتساب',
      recommendedAction: 'open_whatsapp',
    });
  }
  if (s.hasWhatsappFlow && !s.hasFirstReplyTemplate) {
    f.push({
      code: 'whatsapp.no_first_reply', lane: 'whatsapp',
      title: 'مفيش قالب أول رد',
      explanation: 'الـ flow مالوش قالب «أول رد»، وده أهم رسالة في السرعة.',
      evidence: { hasFirstReplyTemplate: false },
      severity: 'medium', confidence: 'high', moneyImpact: null,
      fastestFix: 'أضف قالب أول رد سريع',
      recommendedAction: 'open_whatsapp',
    });
  }
  if (s.hasWhatsappFlow && !s.hasFollowupTemplate) {
    f.push({
      code: 'whatsapp.no_followup', lane: 'whatsapp',
      title: 'مفيش قوالب متابعة',
      explanation: 'مفيش قوالب متابعة بعد الصمت — العملاء بيضيعوا بدون متابعة.',
      evidence: { hasFollowupTemplate: false },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'أضف قوالب متابعة محترمة (no-zann)',
      recommendedAction: 'open_whatsapp',
    });
  }
  if (s.clickedNoReplySent > 0) {
    f.push({
      code: 'whatsapp.clicked_no_reply', lane: 'whatsapp',
      title: 'عملاء ضغطوا واتساب من غير رد متبعت',
      explanation: `${s.clickedNoReplySent} عميل ضغط واتساب ولسه مفيش رد اتبعتله (ولا حتى يدوي).`,
      evidence: { clickedNoReplySent: s.clickedNoReplySent },
      severity: s.clickedNoReplySent >= 5 ? 'high' : 'medium', confidence: 'high', moneyImpact: money(s, s.clickedNoReplySent),
      fastestFix: 'استخدم الـ copilot وابعت أول رد للعملاء دول',
      recommendedAction: 'open_leads:clicked_not_contacted',
    });
  }

  // ---- PAYMENT ----
  if (s.waitingPaymentStuck > 0) {
    const lost = s.waitingPaymentStuck;
    f.push({
      code: 'payment.waiting_stuck', lane: 'payment',
      title: 'عملاء عالقين في انتظار الدفع',
      explanation: `${lost} عميل في «بانتظار الدفع» لفترة طويلة — أكبر تسريب إيراد محتمل.`,
      evidence: { stuck: lost, waitingTotal: s.waitingPaymentCount },
      severity: lost >= 3 ? 'critical' : 'high', confidence: 'high', moneyImpact: money(s, lost),
      fastestFix: 'ابعت تذكير دفع + بسّط خطوات الدفع المحلي',
      recommendedAction: 'open_leads:waiting_payment',
    });
  }
  if (s.proofUploadedNotConfirmed > 0) {
    f.push({
      code: 'payment.proof_unconfirmed', lane: 'payment',
      title: 'إثباتات دفع مش متأكَّدة',
      explanation: `${s.proofUploadedNotConfirmed} عميل رفع إثبات دفع ولسه مش متأكَّد.`,
      evidence: { proofUploadedNotConfirmed: s.proofUploadedNotConfirmed },
      severity: 'high', confidence: 'high', moneyImpact: money(s, s.proofUploadedNotConfirmed),
      fastestFix: 'راجع الإثباتات وأكّد الدفع وسلّم المنتج',
      recommendedAction: 'open_leads:all',
    });
  }
  if (s.paidNotDelivered > 0) {
    f.push({
      code: 'payment.paid_not_delivered', lane: 'payment',
      title: 'عملاء دفعوا ولسه مستلموش',
      explanation: `${s.paidNotDelivered} عميل دفع ولسه «تم التسليم» مش متعلّم — خطر على الثقة.`,
      evidence: { paidNotDelivered: s.paidNotDelivered },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'سلّم الوصول للعملaء اللي دفعوا',
      recommendedAction: 'open_leads:paid',
    });
  }
  if (s.paymentStuckCount > 0) {
    f.push({
      code: 'payment.stuck_state', lane: 'payment',
      title: 'حالات دفع متوقفة',
      explanation: `${s.paymentStuckCount} عميل حالة دفعه «متوقف».`,
      evidence: { paymentStuckCount: s.paymentStuckCount },
      severity: 'high', confidence: 'high', moneyImpact: money(s, s.paymentStuckCount),
      fastestFix: 'تواصل مع العملاء وحلّ مشكلة الدفع',
      recommendedAction: 'open_leads:payment_stuck',
    });
  }
  // ---- payment FLOW config leaks (Sprint 9) ----
  if (!s.hasPaymentMethod && (s.leadsCount > 0 || s.priceReached > 0)) {
    f.push({
      code: 'payment.no_method', lane: 'payment',
      title: 'مفيش طريقة دفع متظبطة',
      explanation: 'القمع مالوش أي طريقة دفع، فمفيش إزاي العميل يدفع.',
      evidence: { hasPaymentMethod: false },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'أضف طريقة دفع من تبويب الدفع',
      recommendedAction: 'open_payment',
    });
  }
  if (s.paymentMethodsMissingInstructions > 0) {
    f.push({
      code: 'payment.missing_instructions', lane: 'payment',
      title: 'طرق دفع بدون تعليمات',
      explanation: `${s.paymentMethodsMissingInstructions} طريقة دفع من غير تعليمات أو رسالة واتساب.`,
      evidence: { paymentMethodsMissingInstructions: s.paymentMethodsMissingInstructions },
      severity: 'medium', confidence: 'high', moneyImpact: null,
      fastestFix: 'ولّد تعليمات الدفع بضغطة من تبويب الدفع',
      recommendedAction: 'open_payment',
    });
  }
  if (s.proofRequiredNoProofStep > 0) {
    f.push({
      code: 'payment.proof_required_no_step', lane: 'payment',
      title: 'إثبات مطلوب بدون خطوة إثبات',
      explanation: `${s.proofRequiredNoProofStep} طريقة بتطلب إثبات من غير تعليمات إثبات واضحة.`,
      evidence: { proofRequiredNoProofStep: s.proofRequiredNoProofStep },
      severity: 'low', confidence: 'medium', moneyImpact: null,
      fastestFix: 'أضف تعليمات رفع الإثبات للطريقة',
      recommendedAction: 'open_payment',
    });
  }
  if (s.proofUploadedNotReviewed > 0) {
    f.push({
      code: 'payment.proof_not_reviewed', lane: 'payment',
      title: 'إثباتات مرفوعة بدون مراجعة',
      explanation: `${s.proofUploadedNotReviewed} عميل رفع إثبات ولسه محدش راجعه.`,
      evidence: { proofUploadedNotReviewed: s.proofUploadedNotReviewed },
      severity: 'high', confidence: 'high', moneyImpact: money(s, s.proofUploadedNotReviewed),
      fastestFix: 'راجِع الإثباتات وأكّد الدفع',
      recommendedAction: 'open_leads:all',
    });
  }
  if (s.confirmedNotDelivered > 0) {
    f.push({
      code: 'payment.confirmed_not_delivered', lane: 'payment',
      title: 'دفع مؤكَّد بدون تسليم',
      explanation: `${s.confirmedNotDelivered} عميل دفعه مؤكَّد ولسه الوصول مش متسلّم.`,
      evidence: { confirmedNotDelivered: s.confirmedNotDelivered },
      severity: 'high', confidence: 'high', moneyImpact: null,
      fastestFix: 'سلّم الوصول للعملاء اللي دفعهم مؤكَّد',
      recommendedAction: 'open_leads:paid',
    });
  }
  if (s.detailsSentNoWaiting > 0) {
    f.push({
      code: 'payment.details_no_waiting', lane: 'payment',
      title: 'اتبعت تفاصيل الدفع من غير متابعة',
      explanation: `${s.detailsSentNoWaiting} عميل اتبعتله تفاصيل الدفع ولسه مش في «بانتظار الدفع».`,
      evidence: { detailsSentNoWaiting: s.detailsSentNoWaiting },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'تابع العملاء دول وعلّمهم بانتظار الدفع',
      recommendedAction: 'open_leads:waiting_payment',
    });
  }
  if (s.waitingNoFollowupTask > 0) {
    f.push({
      code: 'payment.waiting_no_task', lane: 'payment',
      title: 'بانتظار الدفع بدون مهمة متابعة',
      explanation: `${s.waitingNoFollowupTask} عميل بانتظار الدفع من غير مهمة متابعة.`,
      evidence: { waitingNoFollowupTask: s.waitingNoFollowupTask },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'أنشئ مهمة متابعة لكل عميل منتظر الدفع',
      recommendedAction: 'open_leads:waiting_payment',
    });
  }

  // ---- FOLLOW-UP ----
  if (s.overdueTasks > 0) {
    f.push({
      code: 'followup.overdue_tasks', lane: 'followup',
      title: 'مهام متابعة متأخرة',
      explanation: `${s.overdueTasks} مهمة متابعة فات موعدها.`,
      evidence: { overdueTasks: s.overdueTasks },
      severity: s.overdueTasks >= 5 ? 'high' : 'medium', confidence: 'high', moneyImpact: null,
      fastestFix: 'خلّص المهام المتأخرة دلوقتي',
      recommendedAction: 'open_leads:needs_followup',
    });
  }
  if (s.leadsNeedingFollowupNoDate > 0) {
    f.push({
      code: 'followup.no_date', lane: 'followup',
      title: 'عملاء محتاجين متابعة بدون موعد',
      explanation: `${s.leadsNeedingFollowupNoDate} عميل محتاج متابعة من غير تاريخ محدّد.`,
      evidence: { leadsNeedingFollowupNoDate: s.leadsNeedingFollowupNoDate },
      severity: 'medium', confidence: 'medium', moneyImpact: null,
      fastestFix: 'حدّد موعد متابعة لكل عميل',
      recommendedAction: 'open_leads:needs_followup',
    });
  }
  if (s.lostWithoutReason > 0) {
    f.push({
      code: 'followup.lost_no_reason', lane: 'followup',
      title: 'عملاء خسرانين بدون سبب',
      explanation: `${s.lostWithoutReason} عميل اتعلّم «خسران» من غير سبب — مش هنتعلّم من التسريب.`,
      evidence: { lostWithoutReason: s.lostWithoutReason },
      severity: 'low', confidence: 'high', moneyImpact: null,
      fastestFix: 'أضف سبب الخسارة لكل عميل',
      recommendedAction: 'open_leads:lost',
    });
  }
  if (s.highRiskNoAction > 0) {
    f.push({
      code: 'followup.high_risk_no_action', lane: 'followup',
      title: 'عملاء عالي النية بدون إجراء',
      explanation: `${s.highRiskNoAction} عميل عالي النية من غير إجراء تالي.`,
      evidence: { highRiskNoAction: s.highRiskNoAction },
      severity: 'high', confidence: 'medium', moneyImpact: money(s, s.highRiskNoAction),
      fastestFix: 'حدّد إجراء تالي للعملاء عالي النية',
      recommendedAction: 'open_leads:high_intent',
    });
  }

  return f;
}

const SEV_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** The single biggest leak: highest severity, then highest money impact. */
export function biggestLeak(findings: LeakFinding[]): LeakFinding | null {
  if (!findings.length) return null;
  return [...findings].sort((a, b) => {
    const sv = SEV_RANK[b.severity] - SEV_RANK[a.severity];
    if (sv !== 0) return sv;
    return (b.moneyImpact ?? 0) - (a.moneyImpact ?? 0);
  })[0];
}

/** Per-lane summary for the board. */
export function laneSummary(findings: LeakFinding[]): Record<Lane, { count: number; worst: Severity | null; topFix: string | null }> {
  const lanes: Lane[] = ['traffic', 'page', 'whatsapp', 'payment', 'followup', 'tracking'];
  const out = {} as Record<Lane, { count: number; worst: Severity | null; topFix: string | null }>;
  for (const lane of lanes) {
    const inLane = findings.filter((x) => x.lane === lane);
    const worst = inLane.length ? inLane.reduce((a, b) => (SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a)) : null;
    out[lane] = { count: inLane.length, worst: worst?.severity ?? null, topFix: worst?.fastestFix ?? null };
  }
  return out;
}
