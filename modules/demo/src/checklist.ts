/**
 * Pilot Setup Checklist — pure. Given booleans about a funnel's state, compute
 * readiness: ordered steps, done/missing, progress %, and the CTA for each gap.
 */

export interface ChecklistState {
  funnelCreated: boolean;
  offerCompleted: boolean;
  funnelMapReady: boolean;
  pageGenerated: boolean;
  pagePublished: boolean;
  trackedLinkCreated: boolean;
  paymentMethodsAdded: boolean;
  whatsappFlowGenerated: boolean;
  leadsReceiving: boolean;
  paymentStatesActive: boolean;
  leakDiagnosisRun: boolean;
  actionCenterPopulated: boolean;
  weeklyReportGenerated: boolean;
  commandBarReady: boolean;
}

export interface ChecklistItem {
  key: keyof ChecklistState;
  label: string;
  done: boolean;
  cta: string;
  targetTab: string;
}

const ITEMS: { key: keyof ChecklistState; label: string; cta: string; targetTab: string }[] = [
  { key: 'funnelCreated', label: 'إنشاء القمع', cta: 'ابدأ قمع', targetTab: 'overview' },
  { key: 'offerCompleted', label: 'إكمال العرض', cta: 'كمّل العرض', targetTab: 'offer' },
  { key: 'funnelMapReady', label: 'خريطة القمع جاهزة', cta: 'راجِع الخريطة', targetTab: 'map' },
  { key: 'pageGenerated', label: 'توليد صفحة الهبوط', cta: 'ولّد الصفحة', targetTab: 'page' },
  { key: 'pagePublished', label: 'نشر صفحة الهبوط', cta: 'انشر الصفحة', targetTab: 'page' },
  { key: 'trackedLinkCreated', label: 'رابط واتساب متتبَّع', cta: 'أنشئ رابط', targetTab: 'capture' },
  { key: 'paymentMethodsAdded', label: 'إضافة طرق الدفع', cta: 'أضف طرق دفع', targetTab: 'payment' },
  { key: 'whatsappFlowGenerated', label: 'توليد flow واتساب', cta: 'ولّد الـ flow', targetTab: 'whatsapp' },
  { key: 'leadsReceiving', label: 'خط العملاء بيستقبل', cta: 'انشر الرابط', targetTab: 'capture' },
  { key: 'paymentStatesActive', label: 'حالات الدفع نشطة', cta: 'تابع الدفع', targetTab: 'leads' },
  { key: 'leakDiagnosisRun', label: 'تشغيل تشخيص التسريبات', cta: 'شغّل التشخيص', targetTab: 'leaks' },
  { key: 'actionCenterPopulated', label: 'مركز الإجراءات فعّال', cta: 'افتح الإجراءات', targetTab: 'leaks' },
  { key: 'weeklyReportGenerated', label: 'توليد التقرير الأسبوعي', cta: 'ولّد التقرير', targetTab: 'report' },
  { key: 'commandBarReady', label: 'شريط الأوامر جاهز', cta: 'جرّب أمر', targetTab: 'overview' },
];

export function computeChecklist(state: ChecklistState): { items: ChecklistItem[]; progress: number; missing: ChecklistItem[] } {
  const items: ChecklistItem[] = ITEMS.map((it) => ({ ...it, done: !!state[it.key] }));
  const doneCount = items.filter((i) => i.done).length;
  const progress = Math.round((doneCount / items.length) * 100);
  const missing = items.filter((i) => !i.done);
  return { items, progress, missing };
}
