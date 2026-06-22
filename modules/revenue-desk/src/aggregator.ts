/**
 * Revenue Desk aggregator — PURE. Turns all operating signals into ONE deduped,
 * prioritized, sectioned desk. Resolves the "five-concept collapse" by giving
 * every item a real type, and resolves duplication by collapsing overlapping
 * signals (opportunity+recommendation → one item; leak+repair → the repair).
 * Priority is explained, never a black box.
 */

import {
  TYPE_META, SECTION_META, severityRank, type DeskItemType, type DeskSection, type DeskDomain, type Severity,
} from './taxonomy.js';

export interface DeskSource {
  // opportunities (already learning-scored upstream)
  opportunities?: { id: string; opportunityType: string; title: string; priorityScore: number; urgency: string; estimatedValue: number | null; valueCurrency: string | null; recommendedAction?: string; leadId?: string | null; hasRecommendation?: boolean; recommendationId?: string | null; recommendationTitle?: string | null }[];
  // recommendations not tied to a surfaced opportunity above
  recommendations?: { id: string; recommendationType: string; title: string; explanation: string; priorityScore: number; urgency: string; confidence: string; status: string; opportunityId?: string | null; requiresApproval?: boolean; lastOutcomeStatus?: string | null; appliedAwaitingMeasure?: boolean }[];
  // repairs
  pendingRepairs?: { id: string; title: string; status: string; leakId?: string | null; learningConfidence?: string | null }[];
  measurableRepairs?: { id: string; title: string; lastOutcome: string | null }[];
  // leaks (raw) — suppressed if a repair plan already covers them
  openLeaks?: { id: string; title: string; severity: string; recommendedAction?: string }[];
  // playbooks
  pendingApplications?: { id: string; scope: string; status: string; confidence: string }[];
  measurableApplications?: { id: string; scope: string; lastOutcome: string | null }[];
  // tasks
  overdueTasks?: { id: string; leadId?: string | null; title: string; dueAt?: string | null; kind?: string | null }[];
  // portfolio / rhythm / reports / system
  portfolioInsights?: { id: string; insightType: string; title: string; recommendedAction: string; confidence: string }[];
  scheduledFailures?: { id: string; jobType: string; error: string }[];
  weeklyReportReady?: boolean;
  insufficientTracking?: { funnelId: string; reason: string } | null;
}

export interface DeskItem {
  id: string;               // dedupe key: domain:sourceId
  type: DeskItemType;
  domain: DeskDomain;
  section: DeskSection;
  label: string;
  icon: string;
  severity: Severity;
  title: string;
  explanation: string;
  whyRankedHere: string;
  primaryAction: string;
  route: string;
  status: string | null;
  value: number | null;
  valueCurrency: string | null;
  confidence: string | null;
  priorityScore: number;
  requiresApproval: boolean;
  sourceType: string;
  sourceId: string;
  // when an opportunity already has a recommendation, the unified item exposes both
  secondary?: { kind: string; id: string; title: string } | null;
}

const URG_BONUS: Record<string, number> = { critical: 30, high: 18, medium: 8, low: 0 };

function mk(partial: Omit<DeskItem, 'domain' | 'section' | 'label' | 'icon' | 'severity' | 'primaryAction' | 'route'>): DeskItem {
  const meta = TYPE_META[partial.type];
  return { ...partial, domain: meta.domain, section: meta.section, label: meta.label, icon: meta.icon, severity: meta.severity, primaryAction: meta.primaryAction, route: meta.route };
}

const OPP_TYPE_TO_DESK: Record<string, DeskItemType> = {
  waiting_payment_recovery: 'waiting_payment_opportunity',
  proof_review: 'proof_review_opportunity',
  access_delivery: 'access_delivery_opportunity',
  whatsapp_first_reply: 'whatsapp_reply_opportunity',
};

export function buildDesk(src: DeskSource): { items: DeskItem[]; sections: { section: DeskSection; label: string; items: DeskItem[] }[]; topItem: DeskItem | null; counts: Record<string, number> } {
  const items: DeskItem[] = [];
  const seen = new Set<string>();
  const push = (it: DeskItem) => { if (!seen.has(it.id)) { seen.add(it.id); items.push(it); } };

  // ---- leaks covered by a repair plan are suppressed (show the repair, not the raw leak) ----
  const leaksWithRepair = new Set((src.pendingRepairs ?? []).map((r) => r.leakId).filter(Boolean) as string[]);
  // ---- opportunities that already have a recommendation collapse into ONE item ----
  const oppWithRec = new Set((src.opportunities ?? []).filter((o) => o.hasRecommendation).map((o) => o.id));

  // ---- OPPORTUNITIES (with recommendation folded in) ----
  for (const o of src.opportunities ?? []) {
    const type = OPP_TYPE_TO_DESK[o.opportunityType] ?? 'revenue_opportunity';
    let score = o.priorityScore + (URG_BONUS[o.urgency] ?? 0);
    if (o.estimatedValue != null) score += 6;
    const why: string[] = [`فرصة ${o.urgency === 'critical' ? 'حرجة' : o.urgency === 'high' ? 'عالية' : 'متوسطة'}`];
    if (o.estimatedValue != null) why.push('قيمة معروفة');
    let title = o.title;
    let secondary = null as DeskItem['secondary'];
    if (o.hasRecommendation && o.recommendationTitle) {
      title = `${o.title} — أفضل إجراء: ${o.recommendationTitle}`;
      why.push('فيه توصية مدعومة بالتعلّم');
      score += 6;
      secondary = { kind: 'recommendation', id: o.recommendationId ?? '', title: o.recommendationTitle };
    }
    push(mk({
      id: `opportunity:${o.id}`, type, title, explanation: o.recommendedAction ?? '',
      whyRankedHere: `الترتيب: ${why.join('، ')}.`, status: null, value: o.estimatedValue, valueCurrency: o.valueCurrency,
      confidence: null, priorityScore: Math.min(100, score), requiresApproval: false, sourceType: 'opportunity', sourceId: o.id, secondary,
    }));
  }

  // ---- RECOMMENDATIONS not already folded into an opportunity ----
  for (const r of src.recommendations ?? []) {
    if (r.opportunityId && oppWithRec.has(r.opportunityId)) continue;   // dedupe: shown via the opportunity
    let type: DeskItemType;
    if (r.appliedAwaitingMeasure || r.lastOutcomeStatus === 'awaiting_evidence' || r.lastOutcomeStatus === 'early_signal') type = 'recommendation_outcome_due';
    else if (r.lastOutcomeStatus === 'no_result') type = 'recommendation_no_result';
    else if (r.status === 'proposed' && r.requiresApproval) type = 'recommendation_waiting_approval';
    else type = 'best_next_action';
    const score = r.priorityScore + (URG_BONUS[r.urgency] ?? 0);
    push(mk({
      id: `recommendation:${r.id}`, type, title: r.title, explanation: r.explanation,
      whyRankedHere: `توصية بثقة ${r.confidence === 'high' ? 'عالية' : r.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}.`,
      status: r.lastOutcomeStatus ?? r.status, value: null, valueCurrency: null, confidence: r.confidence,
      priorityScore: Math.min(100, score), requiresApproval: !!r.requiresApproval && type === 'recommendation_waiting_approval', sourceType: 'recommendation', sourceId: r.id, secondary: null,
    }));
  }

  // ---- REPAIRS ----
  for (const rp of src.pendingRepairs ?? []) {
    const type: DeskItemType = rp.status === 'partially_applied' ? 'repair_plan_partially_applied' : 'repair_plan_pending_approval';
    push(mk({
      id: `repair:${rp.id}`, type, title: rp.title, explanation: 'خطة إصلاح جاهزة — محتاجة موافقتك قبل التطبيق.',
      whyRankedHere: rp.status === 'partially_applied' ? 'مطبّقة جزئيًا — محتاجة إكمال.' : 'تنتظر موافقة.',
      status: rp.status, value: null, valueCurrency: null, confidence: rp.learningConfidence ?? null,
      priorityScore: rp.status === 'partially_applied' ? 78 : 70, requiresApproval: true, sourceType: 'repair_plan', sourceId: rp.id, secondary: null,
    }));
  }
  for (const mr of src.measurableRepairs ?? []) {
    const type: DeskItemType = mr.lastOutcome === 'no_change' ? 'repair_no_change' : 'repair_outcome_due';
    push(mk({
      id: `measure_repair:${mr.id}`, type, title: mr.title, explanation: 'إصلاح اتطبّق وفات وقت — محتاج قياس أثر.',
      whyRankedHere: 'نتيجة مستحقة القياس.', status: mr.lastOutcome, value: null, valueCurrency: null, confidence: null,
      priorityScore: 55, requiresApproval: false, sourceType: 'repair_plan', sourceId: mr.id, secondary: null,
    }));
  }

  // ---- LEAKS (only those NOT covered by a repair plan) ----
  for (const k of src.openLeaks ?? []) {
    if (leaksWithRepair.has(k.id)) continue;   // dedupe: the repair item represents it
    push(mk({
      id: `leak:${k.id}`, type: 'leak_detected', title: k.title, explanation: k.recommendedAction ?? '',
      whyRankedHere: `شدّة التسريب: ${k.severity}.`, status: null, value: null, valueCurrency: null, confidence: null,
      priorityScore: k.severity === 'critical' ? 72 : k.severity === 'high' ? 62 : 48, requiresApproval: false, sourceType: 'leak', sourceId: k.id, secondary: null,
    }));
  }

  // ---- PLAYBOOKS ----
  for (const ap of src.pendingApplications ?? []) {
    push(mk({ id: `playbook_app:${ap.id}`, type: 'playbook_application_pending', title: `تطبيق playbook على ${ap.scope}`, explanation: 'تطبيق مقترح — محتاج موافقة.', whyRankedHere: `ثقة ${ap.confidence}.`, status: ap.status, value: null, valueCurrency: null, confidence: ap.confidence, priorityScore: 50, requiresApproval: true, sourceType: 'application_plan', sourceId: ap.id, secondary: null }));
  }
  for (const ma of src.measurableApplications ?? []) {
    push(mk({ id: `measure_application:${ma.id}`, type: 'playbook_application_outcome_due', title: `قياس تطبيق ${ma.scope}`, explanation: 'تطبيق اتعمل — محتاج قياس.', whyRankedHere: 'نتيجة مستحقة القياس.', status: ma.lastOutcome, value: null, valueCurrency: null, confidence: null, priorityScore: 48, requiresApproval: false, sourceType: 'application_plan', sourceId: ma.id, secondary: null }));
  }

  // ---- TASKS (overdue) — dedupe against any lead already surfaced via an opportunity ----
  const oppLeadIds = new Set((src.opportunities ?? []).map((o) => o.leadId).filter(Boolean) as string[]);
  for (const t of src.overdueTasks ?? []) {
    if (t.leadId && oppLeadIds.has(t.leadId)) continue;   // the opportunity card already covers this lead
    const type: DeskItemType = t.kind === 'confirm_proof' ? 'proof_review_task' : t.kind === 'deliver' ? 'delivery_task' : t.kind === 'whatsapp_followup' ? 'followup_due' : 'task_overdue';
    push(mk({ id: `task:${t.id}`, type, title: t.title, explanation: 'مهمة فات موعدها.', whyRankedHere: 'متأخرة.', status: 'overdue', value: null, valueCurrency: null, confidence: null, priorityScore: 60, requiresApproval: false, sourceType: 'task', sourceId: t.id, secondary: null }));
  }

  // ---- DIAGNOSIS: insufficient tracking ----
  if (src.insufficientTracking) {
    push(mk({ id: `tracking:${src.insufficientTracking.funnelId}`, type: 'insufficient_tracking_data', title: 'بيانات التتبّع غير كافية للتشخيص', explanation: src.insufficientTracking.reason, whyRankedHere: 'من غير تتبّع مفيش تشخيص موثوق.', status: null, value: null, valueCurrency: null, confidence: null, priorityScore: 40, requiresApproval: false, sourceType: 'funnel', sourceId: src.insufficientTracking.funnelId, secondary: null }));
  }

  // ---- PORTFOLIO insights (stale) ----
  for (const pi of src.portfolioInsights ?? []) {
    push(mk({ id: `portfolio:${pi.id}`, type: 'portfolio_insight_stale', title: pi.title, explanation: pi.recommendedAction, whyRankedHere: `ثقة ${pi.confidence}.`, status: null, value: null, valueCurrency: null, confidence: pi.confidence, priorityScore: 30, requiresApproval: false, sourceType: 'portfolio_insight', sourceId: pi.id, secondary: null }));
  }

  // ---- SYSTEM: scheduled failures + weekly report ----
  for (const sf of src.scheduledFailures ?? []) {
    push(mk({ id: `sysfail:${sf.id}`, type: 'scheduled_refresh_failed', title: `تحديث «${sf.jobType}» فشل`, explanation: sf.error, whyRankedHere: 'فشل في التشغيل المجدوَل.', status: 'failed', value: null, valueCurrency: null, confidence: null, priorityScore: 65, requiresApproval: false, sourceType: 'scheduled_run', sourceId: sf.id, secondary: null }));
  }
  if (src.weeklyReportReady) {
    push(mk({ id: `report:weekly`, type: 'weekly_report_ready', title: 'التقرير الأسبوعي جاهز', explanation: 'ملخّص الأسبوع متاح للعرض.', whyRankedHere: 'تقرير جديد.', status: null, value: null, valueCurrency: null, confidence: null, priorityScore: 20, requiresApproval: false, sourceType: 'report', sourceId: 'weekly', secondary: null }));
  }

  // ---- order: severity, then priority score ----
  items.sort((a, b) => (severityRank(b.severity) - severityRank(a.severity)) || (b.priorityScore - a.priorityScore));

  // ---- group into sections ----
  const bySection = new Map<DeskSection, DeskItem[]>();
  for (const it of items) { if (!bySection.has(it.section)) bySection.set(it.section, []); bySection.get(it.section)!.push(it); }
  const sections = [...bySection.entries()]
    .map(([section, list]) => ({ section, label: SECTION_META[section].label, items: list, order: SECTION_META[section].order }))
    .sort((a, b) => a.order - b.order)
    .map(({ section, label, items }) => ({ section, label, items }));

  const counts: Record<string, number> = {
    total: items.length,
    doNow: items.filter((i) => i.section === 'do_now').length,
    waitingApproval: items.filter((i) => i.section === 'waiting_approval').length,
    opportunities: items.filter((i) => i.section === 'revenue_opportunities').length,
    needsMeasurement: items.filter((i) => i.section === 'needs_measurement').length,
    systemAttention: items.filter((i) => i.section === 'system_attention').length,
  };

  return { items, sections, topItem: items[0] ?? null, counts };
}
