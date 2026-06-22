/**
 * Revenue Desk taxonomy — PURE. The single source of truth for what an operating
 * item IS. Replaces the catch-all `resolve_leak` with real, distinct types so a
 * user can tell a diagnosis from an opportunity from a recommendation from a
 * repair from a task. Every type carries an Arabic label, an icon, a severity, a
 * primary action verb, a target route, and the desk section it belongs to.
 */

export type DeskDomain = 'diagnosis' | 'opportunity' | 'recommendation' | 'repair' | 'playbook' | 'task' | 'system';

export type DeskItemType =
  // diagnosis
  | 'leak_detected' | 'stale_diagnosis' | 'insufficient_tracking_data'
  // opportunity
  | 'revenue_opportunity' | 'waiting_payment_opportunity' | 'proof_review_opportunity' | 'access_delivery_opportunity' | 'whatsapp_reply_opportunity'
  // recommendation
  | 'best_next_action' | 'recommendation_waiting_approval' | 'recommendation_outcome_due' | 'recommendation_no_result'
  // repair
  | 'repair_plan_pending_approval' | 'repair_plan_partially_applied' | 'repair_outcome_due' | 'repair_no_change'
  // playbook
  | 'playbook_application_pending' | 'playbook_application_outcome_due' | 'transferable_playbook'
  // task
  | 'task_overdue' | 'followup_due' | 'proof_review_task' | 'delivery_task'
  // system rhythm
  | 'scheduled_refresh_failed' | 'weekly_report_ready' | 'portfolio_insight_stale';

export type DeskSection = 'do_now' | 'waiting_approval' | 'revenue_opportunities' | 'needs_measurement' | 'diagnosis' | 'reports' | 'system_attention';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface TypeMeta {
  domain: DeskDomain;
  label: string;          // Arabic
  icon: string;           // emoji glyph
  severity: Severity;
  primaryAction: string;  // Arabic verb
  section: DeskSection;
  route: string;          // UI tab/overlay to open
}

export const TYPE_META: Record<DeskItemType, TypeMeta> = {
  // ---- diagnosis ----
  leak_detected: { domain: 'diagnosis', label: 'تسريب إيراد', icon: '🩸', severity: 'high', primaryAction: 'افتح التسريب', section: 'diagnosis', route: 'leaks' },
  stale_diagnosis: { domain: 'diagnosis', label: 'تشخيص قديم', icon: '🕰️', severity: 'low', primaryAction: 'جدّد التشخيص', section: 'diagnosis', route: 'leaks' },
  insufficient_tracking_data: { domain: 'diagnosis', label: 'بيانات تتبّع ناقصة', icon: '📭', severity: 'medium', primaryAction: 'فعّل التتبّع', section: 'diagnosis', route: 'leaks' },
  // ---- opportunity ----
  revenue_opportunity: { domain: 'opportunity', label: 'فرصة إيراد', icon: '💰', severity: 'high', primaryAction: 'اشتغل على الفرصة', section: 'revenue_opportunities', route: 'opportunities' },
  waiting_payment_opportunity: { domain: 'opportunity', label: 'دفع منتظر', icon: '⏳', severity: 'high', primaryAction: 'تابع الدفع', section: 'revenue_opportunities', route: 'opportunities' },
  proof_review_opportunity: { domain: 'opportunity', label: 'إثبات للمراجعة', icon: '🧾', severity: 'high', primaryAction: 'راجِع الإثبات', section: 'revenue_opportunities', route: 'opportunities' },
  access_delivery_opportunity: { domain: 'opportunity', label: 'تسليم مستحق', icon: '📦', severity: 'critical', primaryAction: 'سلّم الوصول', section: 'revenue_opportunities', route: 'opportunities' },
  whatsapp_reply_opportunity: { domain: 'opportunity', label: 'ردّ واتساب', icon: '💬', severity: 'high', primaryAction: 'ردّ دلوقتي', section: 'revenue_opportunities', route: 'opportunities' },
  // ---- recommendation ----
  best_next_action: { domain: 'recommendation', label: 'أفضل إجراء', icon: '🎯', severity: 'high', primaryAction: 'طبّق', section: 'do_now', route: 'recommendations' },
  recommendation_waiting_approval: { domain: 'recommendation', label: 'توصية تنتظر موافقة', icon: '✋', severity: 'medium', primaryAction: 'راجِع ووافق', section: 'waiting_approval', route: 'recommendations' },
  recommendation_outcome_due: { domain: 'recommendation', label: 'توصية محتاجة قياس', icon: '📊', severity: 'medium', primaryAction: 'قيس النتيجة', section: 'needs_measurement', route: 'recommendations' },
  recommendation_no_result: { domain: 'recommendation', label: 'توصية بلا نتيجة', icon: '🔁', severity: 'low', primaryAction: 'جرّب بديل', section: 'needs_measurement', route: 'recommendations' },
  // ---- repair ----
  repair_plan_pending_approval: { domain: 'repair', label: 'إصلاح ينتظر موافقة', icon: '🛠️', severity: 'high', primaryAction: 'راجِع ووافق', section: 'waiting_approval', route: 'leaks' },
  repair_plan_partially_applied: { domain: 'repair', label: 'إصلاح مطبّق جزئيًا', icon: '⚠️', severity: 'high', primaryAction: 'أكمل الإصلاح', section: 'waiting_approval', route: 'leaks' },
  repair_outcome_due: { domain: 'repair', label: 'إصلاح محتاج قياس', icon: '📐', severity: 'medium', primaryAction: 'قيس الأثر', section: 'needs_measurement', route: 'leaks' },
  repair_no_change: { domain: 'repair', label: 'إصلاح بلا تحسّن', icon: '➖', severity: 'low', primaryAction: 'جرّب مقاربة', section: 'needs_measurement', route: 'leaks' },
  // ---- playbook ----
  playbook_application_pending: { domain: 'playbook', label: 'تطبيق playbook ينتظر', icon: '📘', severity: 'medium', primaryAction: 'راجِع ووافق', section: 'waiting_approval', route: 'playbooks' },
  playbook_application_outcome_due: { domain: 'playbook', label: 'تطبيق محتاج قياس', icon: '📏', severity: 'medium', primaryAction: 'قيس الأثر', section: 'needs_measurement', route: 'playbooks' },
  transferable_playbook: { domain: 'playbook', label: 'playbook قابل للنقل', icon: '🔗', severity: 'info', primaryAction: 'اطّلع', section: 'diagnosis', route: 'playbooks' },
  // ---- task ----
  task_overdue: { domain: 'task', label: 'مهمة متأخرة', icon: '⏰', severity: 'high', primaryAction: 'اعملها', section: 'do_now', route: 'pipeline' },
  followup_due: { domain: 'task', label: 'متابعة مستحقة', icon: '📞', severity: 'medium', primaryAction: 'تابع', section: 'do_now', route: 'pipeline' },
  proof_review_task: { domain: 'task', label: 'مهمة مراجعة إثبات', icon: '🧾', severity: 'high', primaryAction: 'راجِع', section: 'do_now', route: 'pipeline' },
  delivery_task: { domain: 'task', label: 'مهمة تسليم', icon: '📦', severity: 'critical', primaryAction: 'سلّم', section: 'do_now', route: 'pipeline' },
  // ---- system ----
  scheduled_refresh_failed: { domain: 'system', label: 'تحديث مجدوَل فشل', icon: '🔴', severity: 'high', primaryAction: 'افحص', section: 'system_attention', route: 'rhythm' },
  weekly_report_ready: { domain: 'system', label: 'تقرير أسبوعي جاهز', icon: '📄', severity: 'info', primaryAction: 'افتح التقرير', section: 'reports', route: 'rhythm' },
  portfolio_insight_stale: { domain: 'system', label: 'رؤية محفظة قديمة', icon: '🗂️', severity: 'low', primaryAction: 'جدّد', section: 'system_attention', route: 'portfolio' },
};

export const SECTION_META: Record<DeskSection, { label: string; order: number }> = {
  do_now: { label: 'اعمل دلوقتي', order: 1 },
  waiting_approval: { label: 'تنتظر موافقتك', order: 2 },
  revenue_opportunities: { label: 'فرص الإيراد', order: 3 },
  needs_measurement: { label: 'محتاجة قياس', order: 4 },
  diagnosis: { label: 'التشخيص', order: 5 },
  reports: { label: 'التقارير', order: 6 },
  system_attention: { label: 'انتباه النظام', order: 7 },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
export const severityRank = (s: Severity) => SEVERITY_RANK[s];

/** Map a legacy action-builder item (which used `resolve_leak` for everything) to a real desk type. */
export function legacyCodeToType(code: string, evidence: Record<string, unknown> = {}): DeskItemType | null {
  const prefix = code.split(':')[0];
  switch (prefix) {
    case 'leak': return 'leak_detected';
    case 'repair': return (evidence.status === 'partially_applied') ? 'repair_plan_partially_applied' : 'repair_plan_pending_approval';
    case 'measure_repair': return 'repair_outcome_due';
    case 'playbook_app': return 'playbook_application_pending';
    case 'measure_application': return 'playbook_application_outcome_due';
    case 'portfolio': return 'portfolio_insight_stale';
    case 'opportunity': return code.includes('needs_check') ? 'recommendation_outcome_due' : 'revenue_opportunity';
    case 'recommendation': return code.includes('needs_check') ? 'recommendation_outcome_due' : 'best_next_action';
    case 'rhythm': return code.includes('stale') ? 'portfolio_insight_stale' : 'repair_outcome_due';
    default: return null;
  }
}
