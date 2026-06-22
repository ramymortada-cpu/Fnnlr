/**
 * Portfolio comparison — PURE. Takes per-funnel metric bags and produces
 * evidence-based cross-funnel insights. Honest by construction: never ranks or
 * declares a "best" funnel without enough comparable data; says so instead.
 * This is an intelligence layer, not a BI dashboard.
 */

export type Confidence = 'low' | 'medium' | 'high';

export interface FunnelMetrics {
  funnelId: string;
  name: string;
  market?: string | null;
  // health
  published: boolean;
  hasTracking: boolean;
  leads: number;
  activeLeads: number;
  openLeaks: number;
  repairsApplied: number;
  playbooksApplied: number;
  // page
  pageViews: number;
  ctaClicks: number;
  whatsappClicks: number;
  ctaRate: number;
  // whatsapp
  clickedNotContacted: number;
  contacted: number;
  // payment
  waitingPayment: number;
  paid: number;
  paymentLeads: number;       // leads with any payment state
  // followup
  overdueTasks: number;
  // learning
  improvedOutcomes: number;
  awaitingOutcomes: number;
}

export interface PortfolioInsight {
  insightType: string;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  confidence: Confidence;
  affectedFunnels: string[];
  recommendedAction: string;
}

// ---- minimum-data thresholds for fair comparison ----
const MIN_VIEWS_FOR_CTA = 30;
const MIN_WA_CLICKS = 10;
const MIN_PAYMENT_LEADS = 5;

function conf(sampleA: number, sampleB: number, floor: number): Confidence {
  const m = Math.min(sampleA, sampleB);
  if (m < floor) return 'low';
  if (m < floor * 3) return 'medium';
  return 'high';
}

/** Health score 0–100 (transparent, not a fabricated metric — a weighted sum of real signals). */
export function funnelHealth(f: FunnelMetrics): number {
  let s = 0;
  if (f.published) s += 15;
  if (f.hasTracking) s += 15;
  if (f.leads > 0) s += 15;
  if (f.pageViews > 0) s += 10;
  if (f.ctaClicks > 0) s += 10;
  if (f.paid > 0) s += 15;
  s -= Math.min(20, f.openLeaks * 5);
  s -= Math.min(10, f.waitingPayment * 2);
  if (f.improvedOutcomes > 0) s += 10;
  return Math.max(0, Math.min(100, s));
}

/**
 * Build cross-funnel insights. Returns an `insufficient_data` insight (not a
 * ranking) when there isn't enough comparable data.
 */
export function comparePortfolio(funnels: FunnelMetrics[]): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];
  if (funnels.length < 2) {
    return [{
      insightType: 'insufficient_data', title: 'محتاج قمعين على الأقل للمقارنة',
      explanation: 'لسه مفيش قمعات كفاية للمقارنة بينها.', evidence: { funnels: funnels.length },
      confidence: 'low', affectedFunnels: funnels.map((f) => f.funnelId), recommendedAction: 'ابنِ قمع تاني',
    }];
  }

  // how many categories have enough comparable data across at least 2 funnels?
  let comparableCategories = 0;

  // ---- CTA rate (needs min views on both compared funnels) ----
  const ctaEligible = funnels.filter((f) => f.pageViews >= MIN_VIEWS_FOR_CTA);
  if (ctaEligible.length >= 2) {
    comparableCategories++;
    const best = [...ctaEligible].sort((a, b) => b.ctaRate - a.ctaRate)[0];
    const worst = [...ctaEligible].sort((a, b) => a.ctaRate - b.ctaRate)[0];
    if (best.funnelId !== worst.funnelId && best.ctaRate - worst.ctaRate >= 0.02) {
      insights.push({
        insightType: 'underperforming_page',
        title: `«${worst.name}» الـ CTA أضعف من «${best.name}»`,
        explanation: `معدل ضغط الـ CTA في «${best.name}» أعلى — ممكن تنقل تحسينات الصفحة.`,
        evidence: { best: { id: best.funnelId, ctaRate: best.ctaRate, views: best.pageViews }, worst: { id: worst.funnelId, ctaRate: worst.ctaRate, views: worst.pageViews } },
        confidence: conf(best.pageViews, worst.pageViews, MIN_VIEWS_FOR_CTA),
        affectedFunnels: [worst.funnelId, best.funnelId],
        recommendedAction: 'apply_playbook_to_funnel',
      });
    }
  } else if (funnels.some((f) => f.pageViews > 0)) {
    insights.push(insufficientCategory('CTA', 'الزيارات لسه أقل من الحد الأدنى للمقارنة', funnels.filter((f) => f.pageViews > 0).map((f) => f.funnelId)));
  }

  // ---- WhatsApp click strength (needs min clicks on both) ----
  const waEligible = funnels.filter((f) => f.whatsappClicks >= MIN_WA_CLICKS);
  if (waEligible.length >= 2) {
    comparableCategories++;
    const best = [...waEligible].sort((a, b) => b.whatsappClicks - a.whatsappClicks)[0];
    const worst = [...waEligible].sort((a, b) => a.whatsappClicks - b.whatsappClicks)[0];
    if (best.funnelId !== worst.funnelId) {
      insights.push({
        insightType: 'strongest_funnel',
        title: `«${best.name}» أقوى في ضغطات واتساب`,
        explanation: `«${best.name}» بيجيب ضغطات واتساب أكتر — راجِع الـ flow بتاعه كنموذج.`,
        evidence: { best: { id: best.funnelId, whatsappClicks: best.whatsappClicks }, worst: { id: worst.funnelId, whatsappClicks: worst.whatsappClicks } },
        confidence: conf(best.whatsappClicks, worst.whatsappClicks, MIN_WA_CLICKS),
        affectedFunnels: [best.funnelId, worst.funnelId],
        recommendedAction: 'replicate_successful_flow',
      });
    }
  }

  // ---- payment friction (needs min payment leads on both) ----
  const payEligible = funnels.filter((f) => f.paymentLeads >= MIN_PAYMENT_LEADS);
  if (payEligible.length >= 2) {
    comparableCategories++;
    const rate = (f: FunnelMetrics) => f.paymentLeads > 0 ? f.paid / f.paymentLeads : 0;
    const worst = [...payEligible].sort((a, b) => rate(a) - rate(b))[0];
    const best = [...payEligible].sort((a, b) => rate(b) - rate(a))[0];
    if (worst.funnelId !== best.funnelId && rate(best) - rate(worst) >= 0.1) {
      insights.push({
        insightType: 'payment_friction',
        title: `«${worst.name}» فيه احتكاك دفع أعلى`,
        explanation: `نسبة إتمام الدفع في «${worst.name}» أقل — فكّر تنقل payment playbook من «${best.name}».`,
        evidence: { worst: { id: worst.funnelId, rate: rate(worst), leads: worst.paymentLeads }, best: { id: best.funnelId, rate: rate(best) } },
        confidence: conf(best.paymentLeads, worst.paymentLeads, MIN_PAYMENT_LEADS),
        affectedFunnels: [worst.funnelId, best.funnelId],
        recommendedAction: 'review_payment_flow',
      });
    }
  }

  // ---- non-comparative, per-funnel health flags (always allowed, evidence is direct) ----
  for (const f of funnels) {
    if (!f.published) insights.push(perFunnel('missing_tracking', `«${f.name}» الصفحة مش منشورة`, 'انشر الصفحة عشان تجيب زيارات.', f, 'publish_page'));
    else if (!f.hasTracking) insights.push(perFunnel('missing_tracking', `«${f.name}» من غير تتبّع`, 'فعّل رابط متتبَّع عشان التشخيص يشتغل.', f, 'create_tracking_link'));
    if (f.pageViews >= MIN_VIEWS_FOR_CTA && f.ctaClicks === 0) insights.push(perFunnel('underperforming_page', `«${f.name}» عنده زيارات بدون ضغطات CTA`, 'الصفحة بتجيب زيارات بس الـ CTA ضعيف.', f, 'fix_underperforming_page'));
    if (f.awaitingOutcomes > 0) insights.push(perFunnel('pending_measurement', `«${f.name}» فيه نتائج مستنية قياس`, 'قِس نتائج الإصلاحات/التطبيقات المعلّقة.', f, 'measure_pending_outcome'));
  }

  // ---- "strongest funnel" only when ≥2 categories were comparable ----
  if (comparableCategories >= 2) {
    const ranked = [...funnels].sort((a, b) => funnelHealth(b) - funnelHealth(a));
    const top = ranked[0], bottom = ranked[ranked.length - 1];
    if (funnelHealth(top) - funnelHealth(bottom) >= 15) {
      insights.unshift({
        insightType: 'strongest_funnel', title: `«${top.name}» هو الأقوى حاليًا`,
        explanation: `بناءً على ${comparableCategories} فئة فيها بيانات كفاية، «${top.name}» الأعلى صحة.`,
        evidence: { top: { id: top.funnelId, health: funnelHealth(top) }, bottom: { id: bottom.funnelId, health: funnelHealth(bottom) }, categories: comparableCategories },
        confidence: comparableCategories >= 3 ? 'high' : 'medium',
        affectedFunnels: [top.funnelId, bottom.funnelId], recommendedAction: 'replicate_successful_flow',
      });
    }
  } else {
    insights.push({
      insightType: 'insufficient_data', title: 'مفيش بيانات كفاية لترتيب القمعات',
      explanation: 'محتاجين فئتين على الأقل فيهم بيانات كافية قبل ما نقول مين الأقوى.',
      evidence: { comparableCategories }, confidence: 'low',
      affectedFunnels: funnels.map((f) => f.funnelId), recommendedAction: 'collect_more_data',
    });
  }

  return insights;
}

function insufficientCategory(cat: string, why: string, ids: string[]): PortfolioInsight {
  return { insightType: 'insufficient_data', title: `مقارنة ${cat}: بيانات غير كافية`, explanation: why, evidence: { category: cat }, confidence: 'low', affectedFunnels: ids, recommendedAction: 'collect_more_data' };
}
function perFunnel(type: string, title: string, explanation: string, f: FunnelMetrics, action: string): PortfolioInsight {
  return { insightType: type, title, explanation, evidence: { funnelId: f.funnelId, leads: f.leads, openLeaks: f.openLeaks }, confidence: 'medium', affectedFunnels: [f.funnelId], recommendedAction: action };
}

/**
 * Detect transferable playbooks: a funnel with a measured improvement of a given
 * type, and another funnel (similar market) that is weak in the same area.
 */
export interface TransferCandidate {
  sourceFunnel: string; targetFunnel: string; playbookType: string;
  why: string; confidence: Confidence; recommendedAction: string;
}
export function findTransferable(funnels: FunnelMetrics[]): TransferCandidate[] {
  const out: TransferCandidate[] = [];
  // source = improved + applied a playbook; target = same market, weak signal, no improvement yet
  const sources = funnels.filter((f) => f.improvedOutcomes > 0 && f.playbooksApplied > 0);
  for (const src of sources) {
    for (const tgt of funnels) {
      if (tgt.funnelId === src.funnelId) continue;
      if ((src.market ?? null) !== (tgt.market ?? null)) continue;
      // payment transfer
      if (tgt.paymentLeads >= MIN_PAYMENT_LEADS && tgt.paid / Math.max(1, tgt.paymentLeads) < 0.5 && tgt.improvedOutcomes === 0) {
        out.push({ sourceFunnel: src.funnelId, targetFunnel: tgt.funnelId, playbookType: 'payment',
          why: `«${src.name}» اتحسّن بعد تطبيق playbook، و«${tgt.name}» في نفس السوق عنده احتكاك دفع.`,
          confidence: 'medium', recommendedAction: 'apply_playbook_to_funnel' });
      }
      // page transfer
      else if (tgt.pageViews >= MIN_VIEWS_FOR_CTA && tgt.ctaRate < src.ctaRate && tgt.improvedOutcomes === 0) {
        out.push({ sourceFunnel: src.funnelId, targetFunnel: tgt.funnelId, playbookType: 'page',
          why: `«${src.name}» عنده CTA أقوى وممكن تنقل تحسيناته لـ «${tgt.name}».`,
          confidence: 'medium', recommendedAction: 'apply_playbook_to_funnel' });
      }
    }
  }
  return out;
}
