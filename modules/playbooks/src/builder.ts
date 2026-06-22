/**
 * Adaptive playbook builder — PURE. Turns accumulated repair learning (and leak
 * frequency) into structured playbook recommendations that shape how the next
 * funnel/offer/page/whatsapp/payment/followup is built. Honest by construction:
 * confidence is gated by decided sample size and never high on thin/undecided
 * data. With too little data, it returns a default playbook + a fallback reason.
 */

export type PlaybookType = 'funnel' | 'offer' | 'page' | 'whatsapp' | 'payment' | 'followup';
export type Confidence = 'low' | 'medium' | 'high';

export interface LearningInput {
  repairType: string;
  market: string | null;
  successStatus: string;   // improved | early_signal | no_change | worsened | inconclusive | awaiting_data
  sourceId?: string | null;
}

export interface PlaybookRecommendation {
  playbookType: PlaybookType;
  scope: 'global' | 'market';
  market: string | null;
  recommendation: { summary: string; adjustments: string[]; note: string };
  evidenceSummary: { sampleSize: number; decidedCount: number; improvedCount: number; successRate: number | null; topRepairType: string | null };
  sampleSize: number;
  confidence: Confidence;
  limited: boolean;
  fallbackReason: string | null;
}

/** Which repair types inform which playbook (a repair that worked is a hint for prevention). */
const TYPE_TO_PLAYBOOK: Record<string, PlaybookType> = {
  payment_recovery: 'payment', access_delivery_fix: 'payment',
  whatsapp_first_reply: 'whatsapp', whatsapp_followup: 'followup',
  page_cta_fix: 'page', page_hero_fix: 'page',
  followup_fix: 'followup', tracking_fix: 'funnel', attribution_fix: 'funnel',
  // identity mappings: application learning records carry the playbook type directly
  payment: 'payment', whatsapp: 'whatsapp', page: 'page', followup: 'followup', offer: 'offer', funnel: 'funnel',
};

/** Default (heuristic) adjustments per playbook — used when learning is thin. */
const DEFAULT_ADJUSTMENTS: Record<PlaybookType, string[]> = {
  funnel: ['ابدأ بقمع click-to-whatsapp بسيط', 'حُط تتبّع من أول يوم', 'توقّع تسريب عند الدفع اليدوي'],
  offer: ['عرض واضح بضمان', 'CTA واتساب-أولاً', 'عالِج أهم اعتراضين'],
  page: ['CTA واتساب مبكر', 'إثبات قبل السعر', 'FAQ للاعتراضات'],
  whatsapp: ['أول رد سريع وبشري', 'كشف السعر بعد التأهيل', 'متابعة بعد فترة بدون إلحاح'],
  payment: ['قدّم InstaPay/المحفظة كأولوية', 'اطلب إثبات تحويل', 'تذكير دفع مبكر + مهمة مراجعة'],
  followup: ['تابع خلال 24 ساعة', 'نبرة محترمة بدون زنّ', 'حدّد الخطوة الجاية لكل عميل'],
};

/** Learning-derived adjustments when evidence supports them. */
const LEARNED_ADJUSTMENTS: Partial<Record<PlaybookType, string>> = {
  payment: 'في قماقم مشابهة، تذكير الدفع المبكر + مهمة مراجعة الإثبات أعطى إشارة تحسّن.',
  page: 'في صفحات مشابهة، تقديم الـ CTA والإثبات قبل السعر حسّن الضغطات.',
  whatsapp: 'في محادثات مشابهة، أول رد سريع وتأجيل السعر للتأهيل حسّن التقدّم.',
  followup: 'في متابعات مشابهة، تحديد الخطوة الجاية صراحةً قلّل التوقّف.',
  funnel: 'في قماقم مشابهة، التتبّع من البداية قلّل تسريبات الإسناد.',
};

function confidenceFor(decided: number, sampleSize: number, undecided: number): Confidence {
  let c: Confidence = decided < 3 ? 'low' : decided <= 10 ? 'medium' : 'high';
  if (sampleSize > 0 && undecided / sampleSize > 0.5 && c === 'high') c = 'medium';
  return c;
}

/**
 * Build one playbook recommendation of a given type from learning records,
 * optionally market-scoped.
 */
export function buildPlaybook(type: PlaybookType, records: LearningInput[], market?: string | null): PlaybookRecommendation {
  // records that inform this playbook type
  const relevant = records.filter((r) => TYPE_TO_PLAYBOOK[r.repairType] === type && (market == null || r.market === market));
  const decided = relevant.filter((r) => ['improved', 'no_change', 'worsened'].includes(r.successStatus));
  const improvedCount = relevant.filter((r) => r.successStatus === 'improved').length;
  const undecided = relevant.filter((r) => ['awaiting_data', 'inconclusive', 'early_signal'].includes(r.successStatus)).length;
  const sampleSize = relevant.length;
  const decidedCount = decided.length;
  const successRate = decidedCount > 0 ? improvedCount / decidedCount : null;
  const confidence = confidenceFor(decidedCount, sampleSize, undecided);
  const limited = decidedCount < 3;

  // top repair type by frequency among relevant
  const freq: Record<string, number> = {};
  for (const r of relevant) freq[r.repairType] = (freq[r.repairType] ?? 0) + 1;
  const topRepairType = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] ?? null;

  const adjustments = [...DEFAULT_ADJUSTMENTS[type]];
  let note: string;
  if (limited) {
    note = sampleSize === 0
      ? 'بيانات التعلّم لسه محدودة لهذا النوع؛ تم استخدام playbook افتراضي.'
      : `بيانات التعلّم لسه محدودة (${decidedCount} نتيجة محسومة)؛ تم استخدام playbook افتراضي مع تلميحات.`;
  } else {
    // evidence supports a learned adjustment; surface it honestly with counts
    const learned = LEARNED_ADJUSTMENTS[type];
    if (learned && successRate != null && successRate >= 0.34) {
      adjustments.unshift(learned);
      note = `تم تعديل الـ playbook بناءً على ${improvedCount} تحسّن من ${decidedCount} حالة محسومة${market ? ' (نفس السوق)' : ''}.`;
    } else {
      note = `الإصلاحات المشابهة لم تتحسّن غالبًا (${improvedCount}/${decidedCount})؛ احتفظنا بالـ playbook الافتراضي.`;
    }
  }

  return {
    playbookType: type,
    scope: market ? 'market' : 'global',
    market: market ?? null,
    recommendation: { summary: summaryFor(type), adjustments, note },
    evidenceSummary: { sampleSize, decidedCount, improvedCount, successRate, topRepairType },
    sampleSize, confidence, limited,
    fallbackReason: limited ? 'بيانات التعلّم محدودة' : null,
  };
}

function summaryFor(type: PlaybookType): string {
  switch (type) {
    case 'funnel': return 'هيكل القمع الموصى به ونقاط التسريب المتوقّعة.';
    case 'offer': return 'زاوية العرض والضمان وأسلوب الـ CTA.';
    case 'page': return 'ترتيب أقسام الصفحة ومكان الـ CTA والإثبات.';
    case 'whatsapp': return 'أسلوب أول رد وتوقيت كشف السعر والمتابعة.';
    case 'payment': return 'أولوية طرق الدفع ومتطلب الإثبات وتوقيت التذكير.';
    case 'followup': return 'توقيت المتابعة والنبرة وعدد اللمسات.';
  }
}

/** Build the full set of playbooks (all types) from learning records. */
export function buildAllPlaybooks(records: LearningInput[], market?: string | null): PlaybookRecommendation[] {
  // defense-in-depth: one record per source (latest wins) so duplicate raw rows can't inflate sample size
  const bySource = new Map<string, LearningInput>(); const pass: LearningInput[] = [];
  for (const r of records) { if (r.sourceId) bySource.set(r.sourceId, r); else pass.push(r); }
  records = [...pass, ...bySource.values()];
  const types: PlaybookType[] = ['funnel', 'offer', 'page', 'whatsapp', 'payment', 'followup'];
  return types.map((t) => buildPlaybook(t, records, market));
}

/** Condense an active playbook into a short context string for a brain prompt. */
export function playbookToContext(p: PlaybookRecommendation | null): string | null {
  if (!p) return null;
  const conf = p.confidence === 'low' ? 'low' : p.confidence;
  const lines = [`Playbook(${p.playbookType}) confidence=${conf} sample=${p.sampleSize}.`];
  if (p.limited) lines.push('Learning data is limited; use default playbook but you may include the note.');
  else lines.push(`Apply these learning-backed adjustments where natural: ${p.recommendation.adjustments.slice(0, 3).join(' | ')}.`);
  return lines.join(' ');
}
