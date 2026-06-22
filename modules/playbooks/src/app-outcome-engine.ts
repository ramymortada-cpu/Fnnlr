/**
 * Playbook application outcome interpreter — PURE. Given a scope, baseline vs
 * current metrics, and hours elapsed, decide an honest outcome:
 * awaiting_data / early_signal / improved / no_change / worsened / inconclusive.
 *
 * Same honesty discipline as the repair outcome engine (Sprint 18): never judge
 * before the per-scope minimum data is met; view-gated page scopes wait for
 * enough new views; confidence is high only for a large primary move.
 */

export type OutcomeStatus = 'awaiting_data' | 'early_signal' | 'improved' | 'no_change' | 'worsened' | 'inconclusive';
export type Confidence = 'low' | 'medium' | 'high';
export type AppScope = 'all' | 'offer' | 'page' | 'whatsapp' | 'payment' | 'followup' | 'funnel';

export interface MetricBag { [k: string]: number }

export interface AppOutcomeInput {
  scope: AppScope;
  baseline: MetricBag;
  current: MetricBag;
  hoursElapsed: number;
}

export interface AppOutcomeResult {
  status: OutcomeStatus;
  confidence: Confidence;
  delta: MetricBag;
  interpretation: string;
  recommendedNextAction: string;
}

/** Minimum data before a verdict, per scope. */
const MIN_RULES: Record<AppScope, { minHours: number; minViews?: number; signalKeys?: string[]; minSignal?: number; minLanes?: number }> = {
  page:     { minHours: 48, minViews: 30 },
  whatsapp: { minHours: 24, signalKeys: ['repliesMarkedSent', 'inboundReplies', 'contacted'], minSignal: 1 },
  payment:  { minHours: 24 },
  followup: { minHours: 24, signalKeys: ['tasksDone'], minSignal: 1 },
  offer:    { minHours: 48 },
  funnel:   { minHours: 48, minLanes: 2 },
  all:      { minHours: 48, minLanes: 2 },
};

/** Primary metric whose move (up/down) indicates the application worked. */
const PRIMARY: Record<AppScope, { key: string; direction: 'up' | 'down' } | null> = {
  page: { key: 'ctaRate', direction: 'up' },
  whatsapp: { key: 'clickedNotContacted', direction: 'down' },
  payment: { key: 'waitingPayment', direction: 'down' },
  followup: { key: 'overdueTasks', direction: 'down' },
  offer: { key: 'paid', direction: 'up' },
  funnel: { key: 'activeLeaks', direction: 'down' },
  all: { key: 'activeLeaks', direction: 'down' },
};

function diff(baseline: MetricBag, current: MetricBag): MetricBag {
  const out: MetricBag = {};
  for (const k of new Set([...Object.keys(baseline), ...Object.keys(current)])) out[k] = (current[k] ?? 0) - (baseline[k] ?? 0);
  return out;
}

function movement(delta: MetricBag, primary: { key: string; direction: 'up' | 'down' }): number {
  const d = delta[primary.key] ?? 0;
  return primary.direction === 'down' ? -d : d;
}

export function interpretAppOutcome(inp: AppOutcomeInput): AppOutcomeResult {
  const delta = diff(inp.baseline, inp.current);
  const rule = MIN_RULES[inp.scope];
  const primary = PRIMARY[inp.scope];

  const timeMet = inp.hoursElapsed >= rule.minHours;
  let signalMet = true;
  if (rule.signalKeys && rule.minSignal != null) {
    const sig = rule.signalKeys.reduce((s, k) => s + Math.max(0, delta[k] ?? 0), 0);
    signalMet = sig >= rule.minSignal;
  }
  let viewsMet = true;
  if (rule.minViews != null) {
    const views = (inp.current['pageViews'] ?? 0) - (inp.baseline['pageViews'] ?? 0);
    viewsMet = views >= rule.minViews;
  }
  let lanesMet = true;
  if (rule.minLanes != null) {
    // count metric keys that actually moved as a proxy for "lanes with activity"
    const moved = Object.values(delta).filter((v) => Math.abs(v) > 0).length;
    lanesMet = moved >= rule.minLanes;
  }

  const viewGated = rule.minViews != null;
  const enough = timeMet && signalMet && viewsMet && lanesMet;
  if (!enough) {
    const earlySig = !viewGated && primary ? movement(delta, primary) : 0;
    if (earlySig > 0) {
      return { status: 'early_signal', confidence: 'low', delta, interpretation: earlyText(inp.scope, delta), recommendedNextAction: 'collect_more_data' };
    }
    return { status: 'awaiting_data', confidence: 'low', delta, interpretation: 'التطبيق اتعمل — لسه مستنيين بيانات/وقت كفاية للحكم.', recommendedNextAction: 'collect_more_data' };
  }

  if (!primary) return { status: 'inconclusive', confidence: 'low', delta, interpretation: 'مفيش مقياس أساسي واضح للنطاق ده.', recommendedNextAction: 'review_application' };

  const move = movement(delta, primary);
  if (move > 0) {
    const strong = Math.abs(delta[primary.key] ?? 0) >= 3 || (primary.key === 'ctaRate' && Math.abs(delta.ctaRate ?? 0) >= 0.03);
    return { status: 'improved', confidence: strong ? 'high' : 'medium', delta, interpretation: improvedText(inp.scope, delta), recommendedNextAction: 'confirm_application_success' };
  }
  if (move < 0) {
    return { status: 'worsened', confidence: 'medium', delta, interpretation: 'الأرقام اتحركت في الاتجاه الغلط بعد التطبيق — راجِع التغييرات.', recommendedNextAction: 'review_application' };
  }
  return { status: 'no_change', confidence: 'medium', delta, interpretation: 'مفيش تغيّر واضح بعد التطبيق — جرّب تحسين تاني.', recommendedNextAction: 'apply_different_playbook' };
}

function fmt(n: number): string { return (Math.round(n * 100) / 100).toString(); }

function earlyText(scope: AppScope, delta: MetricBag): string {
  if (scope === 'whatsapp') return `إشارة مبكرة: ${Math.abs(delta.clickedNotContacted ?? 0)} عميل اتكلّم معاه بعد التطبيق.`;
  if (scope === 'payment') return `إشارة مبكرة: ${Math.abs(delta.waitingPayment ?? 0)} عميل اتحرّك من «بانتظار الدفع».`;
  if (scope === 'followup') return `إشارة مبكرة: المهام المتأخرة بدأت تقل.`;
  return 'إشارة مبكرة — في حركة بس لسه بدري على الحكم.';
}

function improvedText(scope: AppScope, delta: MetricBag): string {
  if (scope === 'page') return `تحسّن: معدل ضغط الـ CTA زاد بمقدار ${fmt((delta.ctaRate ?? 0) * 100)}%.`;
  if (scope === 'whatsapp') return `تحسّن: ${Math.abs(delta.clickedNotContacted ?? 0)} عميل اتنقل من «ضغط واتساب» للتواصل.`;
  if (scope === 'payment') return `تحسّن: العملاء في «بانتظار الدفع» قلّوا بمقدار ${Math.abs(delta.waitingPayment ?? 0)}.`;
  if (scope === 'followup') return `تحسّن: المهام المتأخرة قلّت بمقدار ${Math.abs(delta.overdueTasks ?? 0)}.`;
  if (scope === 'offer') return `تحسّن: العملاء اللي وصلوا للدفع زادوا بمقدار ${Math.abs(delta.paid ?? 0)}.`;
  return `تحسّن: التسريبات المفتوحة قلّت بمقدار ${Math.abs(delta.activeLeaks ?? 0)}.`;
}

/** Map an application scope to the playbook type used in learning records. */
export function scopeToPlaybookType(scope: AppScope): string {
  return scope === 'all' || scope === 'funnel' ? 'funnel' : scope;
}
