/**
 * Action builder — PURE. Turns observed records (leads, leaks, tasks, payment
 * states, WhatsApp drafts) into a prioritized to-do list. Every action points
 * at a real record; nothing generic. This is what powers "what do I do today?".
 */

import { legacyCodeToType, TYPE_META } from '../../revenue-desk/src/taxonomy.js';

export type ActionType =
  | 'follow_up_lead' | 'review_payment_proof' | 'confirm_payment' | 'deliver_access'
  | 'contact_whatsapp_click' | 'fix_tracking' | 'publish_page' | 'create_tracked_link'
  | 'add_payment_method' | 'use_whatsapp_template' | 'resolve_leak' | 'mark_lost_reason'
  | 'add_next_action';

export interface ActionItem {
  code: string;            // stable dedup key per journey
  type: ActionType;
  // Sprint 33 taxonomy: the REAL operating type (no more catch-all resolve_leak)
  deskType?: string;       // DeskItemType from revenue-desk taxonomy
  domain?: string;         // diagnosis | opportunity | recommendation | repair | playbook | task | system
  sourceType?: string;     // leak | repair_plan | opportunity | recommendation | task | ...
  sourceId?: string;
  title: string;
  explanation: string;
  priority: number;        // higher = more urgent
  dueAt?: string | null;
  recommendedAction: string;
  targetRoute: string;     // tab/filter the UI should open
  evidence: Record<string, unknown>;
  leadId?: string;
  leakId?: string;
}

/** Observed inputs for action generation. */
export interface ActionInputs {
  leadsNeedingFollowup: { id: string; name?: string; stage?: string; followupDueAt?: string | null }[];
  overdueTasks: { id: string; leadId?: string; title: string; dueAt?: string }[];
  waitingPayment: { id: string; name?: string }[];
  proofToReview: { id: string; name?: string }[];
  confirmedNotDelivered: { id: string; name?: string }[];
  whatsappClickedNoContact: { id: string; name?: string }[];
  leadsNoNextAction: { id: string; name?: string }[];
  lostNoReason: { id: string; name?: string }[];
  openLeaks: { id: string; title: string; severity: string; recommendedAction?: string }[];
  pendingRepairs?: { id: string; title: string; status: string; learningConfidence?: string | null }[];
  measurableRepairs?: { id: string; title: string; lastOutcome: string | null }[];
  pendingApplications?: { id: string; scope: string; status: string; confidence: string }[];
  measurableApplications?: { id: string; scope: string; lastOutcome: string | null }[];
  portfolioInsights?: { id: string; insightType: string; title: string; recommendedAction: string; confidence: string }[];
  rhythmSignals?: { repairsDue: number; staleInsights: number };
  topOpportunities?: { id: string; opportunityType: string; title: string; priorityScore: number; urgency: string; recommendedAction: string; estimatedValue: number | null; valueCurrency: string | null }[];
  opportunitiesNeedingCheck?: number;
  topRecommendations?: { id: string; recommendationType: string; title: string; explanation: string; priorityScore: number; urgency: string; confidence: string; learningSource: string }[];
  recommendationsNeedingCheck?: number;
}

const SEV_PRIORITY: Record<string, number> = { critical: 100, high: 80, medium: 50, low: 30 };

/** Build the prioritized action list from observed records. */
export function buildActions(inp: ActionInputs): ActionItem[] {
  const out: ActionItem[] = [];

  for (const l of inp.proofToReview) {
    out.push({
      code: `review_proof:${l.id}`, type: 'review_payment_proof',
      title: `راجِع إثبات دفع — ${l.name || 'عميل'}`,
      explanation: 'العميل رفع إثبات دفع ولسه محدش راجعه.',
      priority: 95, recommendedAction: 'افتح العميل وأكّد أو ارفض الإثبات',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const l of inp.confirmedNotDelivered) {
    out.push({
      code: `deliver:${l.id}`, type: 'deliver_access',
      title: `سلّم الوصول — ${l.name || 'عميل'}`,
      explanation: 'العميل دفعه مؤكَّد ولسه الوصول مش متسلّم — خطر على الثقة.',
      priority: 92, recommendedAction: 'سلّم الوصول دلوقتي',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const l of inp.waitingPayment) {
    out.push({
      code: `waiting_payment:${l.id}`, type: 'confirm_payment',
      title: `تابع دفعة — ${l.name || 'عميل'}`,
      explanation: 'العميل في «بانتظار الدفع» — تابعه وذكّره باحترام.',
      priority: 85, recommendedAction: 'ابعت تذكير الدفع من الـ copilot',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const t of inp.overdueTasks) {
    out.push({
      code: `task:${t.id}`, type: 'follow_up_lead',
      title: `مهمة متأخرة — ${t.title}`,
      explanation: 'مهمة متابعة فات موعدها.',
      priority: 80, dueAt: t.dueAt ?? null, recommendedAction: 'خلّص المهمة أو أعد جدولتها',
      targetRoute: t.leadId ? `lead:${t.leadId}` : 'leads:all', evidence: { taskId: t.id }, leadId: t.leadId,
    });
  }
  for (const l of inp.whatsappClickedNoContact) {
    out.push({
      code: `contact_click:${l.id}`, type: 'contact_whatsapp_click',
      title: `كلّم عميل ضغط واتساب — ${l.name || 'عميل'}`,
      explanation: 'ضغط واتساب ولسه مفيش رد متبعتله.',
      priority: 75, recommendedAction: 'استخدم قالب أول رد من الـ copilot',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const l of inp.leadsNeedingFollowup) {
    out.push({
      code: `followup:${l.id}`, type: 'follow_up_lead',
      title: `متابعة — ${l.name || 'عميل'}`,
      explanation: 'العميل محتاج متابعة.',
      priority: 60, dueAt: l.followupDueAt ?? null, recommendedAction: 'تابع العميل',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const l of inp.leadsNoNextAction) {
    out.push({
      code: `next_action:${l.id}`, type: 'add_next_action',
      title: `حدّد إجراء تالي — ${l.name || 'عميل'}`,
      explanation: 'العميل مالوش إجراء تالي محدّد.',
      priority: 45, recommendedAction: 'حدّد الخطوة الجاية للعميل',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const l of inp.lostNoReason) {
    out.push({
      code: `lost_reason:${l.id}`, type: 'mark_lost_reason',
      title: `سجّل سبب الخسارة — ${l.name || 'عميل'}`,
      explanation: 'العميل خسران من غير سبب مسجّل — مش هنتعلّم من التسريب.',
      priority: 35, recommendedAction: 'أضف سبب الخسارة',
      targetRoute: `lead:${l.id}`, evidence: { leadId: l.id }, leadId: l.id,
    });
  }
  for (const k of inp.openLeaks) {
    out.push({
      code: `leak:${k.id}`, type: 'resolve_leak',
      title: `صلّح تسريب — ${k.title}`,
      explanation: 'تسريب مفتوح في القمع محتاج إجراء.',
      priority: (SEV_PRIORITY[k.severity] ?? 40) - 5, recommendedAction: 'افتح لوحة التسريبات',
      targetRoute: 'leaks', evidence: { leakId: k.id, severity: k.severity }, leakId: k.id,
    });
  }
  for (const rp of inp.pendingRepairs ?? []) {
    const isPartial = rp.status === 'partially_applied';
    const lowConf = rp.status === 'proposed' && rp.learningConfidence === 'low';
    out.push({
      code: `repair:${rp.id}`, type: 'resolve_leak',
      title: isPartial ? `أكمِل خطة إصلاح — ${rp.title}` : lowConf ? `راجِع خطة إصلاح (ثقة منخفضة) — ${rp.title}` : `وافِق على خطة إصلاح — ${rp.title}`,
      explanation: isPartial ? 'خطة إصلاح اتطبّقت جزئيًا ومحتاجة إكمال.' : lowConf ? 'الخطة دي ثقة التعلّم فيها منخفضة — راجِعها أو فكّر في البديل قبل الموافقة.' : 'في خطة إصلاح جاهزة مستنية موافقتك.',
      priority: isPartial ? 88 : lowConf ? 80 : 82, recommendedAction: 'افتح لوحة التسريبات وراجِع الخطة',
      targetRoute: 'leaks', evidence: { repairId: rp.id, status: rp.status, learningConfidence: rp.learningConfidence ?? null },
    });
  }

  for (const mr of inp.measurableRepairs ?? []) {
    const noChange = mr.lastOutcome === 'no_change' || mr.lastOutcome === 'worsened';
    out.push({
      code: `measure_repair:${mr.id}`, type: 'resolve_leak',
      title: noChange ? `إصلاح مفيش منه تحسّن — ${mr.title}` : `قيس نتيجة إصلاح — ${mr.title}`,
      explanation: noChange ? 'الإصلاح اتطبّق ومفيش تحسّن — محتاج إصلاح/إجراء تاني.' : 'إصلاح اتطبّق ولسه متقاسش — قيس النتيجة.',
      priority: noChange ? 78 : 72, recommendedAction: noChange ? 'ابنِ إصلاح تاني' : 'قيس النتيجة من لوحة التسريبات',
      targetRoute: 'leaks', evidence: { repairId: mr.id, lastOutcome: mr.lastOutcome },
    });
  }

  for (const ap of inp.pendingApplications ?? []) {
    const isPartial = ap.status === 'partially_applied';
    const lowConf = ap.status === 'proposed' && ap.confidence === 'low';
    out.push({
      code: `playbook_app:${ap.id}`, type: 'resolve_leak',
      title: isPartial ? `أكمِل تطبيق playbook — ${ap.scope}` : lowConf ? `راجِع تطبيق playbook (ثقة منخفضة) — ${ap.scope}` : `وافِق على تطبيق playbook — ${ap.scope}`,
      explanation: isPartial ? 'خطة تطبيق playbook اتطبّقت جزئيًا.' : lowConf ? 'خطة تطبيق playbook ثقتها منخفضة — راجِعها قبل الموافقة.' : 'في خطة تحسين مبنية على التعلّم مستنية موافقتك.',
      priority: isPartial ? 86 : lowConf ? 79 : 81, recommendedAction: 'افتح لوحة التسريبات وراجِع خطة التطبيق',
      targetRoute: 'leaks', evidence: { applicationPlanId: ap.id, status: ap.status, confidence: ap.confidence },
    });
  }

  for (const ma of inp.measurableApplications ?? []) {
    const noChange = ma.lastOutcome === 'no_change' || ma.lastOutcome === 'worsened';
    out.push({
      code: `measure_application:${ma.id}`, type: 'resolve_leak',
      title: noChange ? `تطبيق playbook مفيش منه تحسّن — ${ma.scope}` : `قيس نتيجة تطبيق playbook — ${ma.scope}`,
      explanation: noChange ? 'التطبيق اتعمل ومفيش تحسّن — جرّب تحسين تاني.' : 'تطبيق playbook اتعمل ولسه متقاسش — قيس النتيجة.',
      priority: noChange ? 77 : 70, recommendedAction: noChange ? 'جرّب playbook تاني' : 'قيس النتيجة من لوحة التسريبات',
      targetRoute: 'leaks', evidence: { applicationPlanId: ma.id, lastOutcome: ma.lastOutcome },
    });
  }

  for (const pi of inp.portfolioInsights ?? []) {
    out.push({
      code: `portfolio:${pi.id}`, type: 'resolve_leak',
      title: `محفظة: ${pi.title}`,
      explanation: 'ملاحظة عبر القمعات محتاجة مراجعة.',
      priority: pi.insightType === 'transferable_playbook' ? 75 : 68,
      recommendedAction: 'افتح محفظة القمعات', targetRoute: 'portfolio',
      evidence: { insightId: pi.id, insightType: pi.insightType, confidence: pi.confidence },
    });
  }

  const rs = inp.rhythmSignals;
  if (rs && rs.repairsDue > 0) {
    out.push({ code: 'rhythm:repairs_due', type: 'resolve_leak',
      title: `${rs.repairsDue} إصلاح محتاج قياس نتيجة`, explanation: 'فات الوقت الكافي على إصلاحات متطبّقة من غير قياس نتيجة.',
      priority: 72, recommendedAction: 'قِس النتائج المستحقة', targetRoute: 'rhythm', evidence: { repairsDue: rs.repairsDue } });
  }
  if (rs && rs.staleInsights > 0) {
    out.push({ code: 'rhythm:stale_insights', type: 'resolve_leak',
      title: `${rs.staleInsights} ملاحظة محفظة قديمة`, explanation: 'ملاحظات المحفظة بقالها فترة — حدّث التحليل.',
      priority: 64, recommendedAction: 'حدّث المحفظة', targetRoute: 'portfolio', evidence: { staleInsights: rs.staleInsights } });
  }

  // revenue opportunities — only surface types NOT already covered by the per-lead
  // action loops above (waiting/proof/delivery/whatsapp already produce actions);
  // link the rest so the same work isn't listed twice.
  const coveredTypes = new Set(['waiting_payment_recovery', 'proof_review', 'access_delivery', 'whatsapp_first_reply', 'followup_reactivation']);
  for (const op of inp.topOpportunities ?? []) {
    if (coveredTypes.has(op.opportunityType)) continue;
    const val = op.estimatedValue != null ? ` — قيمة تقديرية: ${Math.round(Number(op.estimatedValue))} ${op.valueCurrency}` : '';
    out.push({
      code: `opportunity:${op.id}`, type: 'resolve_leak',
      title: `فرصة إيراد: ${op.title}`,
      explanation: `فرصة عالية الأولوية (${op.priorityScore})${val}.`,
      priority: Math.min(95, op.priorityScore + 10),
      recommendedAction: op.recommendedAction || 'افتح فرص الإيراد', targetRoute: 'opportunities',
      evidence: { opportunityId: op.id, urgency: op.urgency },
    });
  }

  if (inp.opportunitiesNeedingCheck && inp.opportunitiesNeedingCheck > 0) {
    out.push({ code: 'opportunity:needs_check', type: 'resolve_leak',
      title: `${inp.opportunitiesNeedingCheck} فرصة محتاجة قياس نتيجة`, explanation: 'فرص اتعمل عليها إجراء وفات وقت من غير دليل تحويل — قيس نتيجتها.',
      priority: 66, recommendedAction: 'افتح فرص الإيراد وقيس النتايج', targetRoute: 'opportunities', evidence: { needingCheck: inp.opportunitiesNeedingCheck } });
  }

  // recommendations enrich the action list — "recommended because…", deduped:
  // these come from opportunities, so only surface the highest as a "do this next".
  const CONF_AR: Record<string, string> = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة منخفضة' };
  for (const rc of (inp.topRecommendations ?? []).slice(0, 2)) {
    out.push({
      code: `recommendation:${rc.id}`, type: 'resolve_leak',
      title: `إجراء مقترح: ${rc.title}`,
      explanation: `موصى به علشان: ${rc.explanation} (${CONF_AR[rc.confidence] ?? rc.confidence}).`,
      priority: Math.min(96, rc.priorityScore + 12),
      recommendedAction: rc.title, targetRoute: 'recommendations',
      evidence: { recommendationId: rc.id, confidence: rc.confidence, source: rc.learningSource },
    });
  }

  if (inp.recommendationsNeedingCheck && inp.recommendationsNeedingCheck > 0) {
    out.push({ code: 'recommendation:needs_check', type: 'resolve_leak',
      title: `${inp.recommendationsNeedingCheck} توصية محتاجة قياس نتيجة`, explanation: 'توصيات اتطبّقت وفات وقت من غير قياس — شوف اشتغلت ولا لأ.',
      priority: 62, recommendedAction: 'قيس نتايج التوصيات', targetRoute: 'recommendations', evidence: { needingCheck: inp.recommendationsNeedingCheck } });
  }

  // Sprint 33: stamp every item with its REAL operating type (no more catch-all
  // resolve_leak). Derives the desk type + domain from the item's code prefix.
  for (const it of out) {
    const dt = legacyCodeToType(it.code, it.evidence);
    if (dt) { it.deskType = dt; it.domain = TYPE_META[dt].domain; it.sourceType = TYPE_META[dt].domain; it.sourceId = it.code.split(':').slice(1).join(':') || it.code; }
  }
  return out.sort((a, b) => b.priority - a.priority);
}
