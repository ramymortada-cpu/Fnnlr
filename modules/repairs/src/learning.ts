import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Repair strategy memory. Aggregates past repair outcomes into honest success
 * signals per repair type (and market when available), with confidence gated by
 * sample size. Never invents wisdom: with too little data it says so.
 */

export interface LearningRecord {
  repairType: string;
  market: string | null;
  successStatus: string;  // improved | early_signal | no_change | worsened | inconclusive | awaiting_data
  confidence: string;
  sourceId?: string | null;
}

export interface LearningSummary {
  repairType: string;
  market: string | null;
  sampleSize: number;
  improvedCount: number;
  earlySignalCount: number;
  noChangeCount: number;
  worsenedCount: number;
  inconclusiveCount: number;
  awaitingCount: number;
  decidedCount: number;        // outcomes that actually concluded (not awaiting/inconclusive)
  successRate: number | null;  // improved / decided, or null if nothing decided
  confidence: 'low' | 'medium' | 'high';
  note: string;
  limited: boolean;
}

/**
 * PURE aggregation. successRate is over DECIDED outcomes only; awaiting_data and
 * inconclusive never inflate it. Confidence depends on decided sample size, and
 * is never 'high' when most records are still awaiting/inconclusive.
 */
export function summarizeLearning(records: LearningRecord[], repairType: string, market?: string | null): LearningSummary {
  // defense-in-depth: one record per source (latest wins) before counting
  const bySource = new Map<string, LearningRecord>(); const pass: LearningRecord[] = [];
  for (const r of records) { if (r.sourceId) bySource.set(r.sourceId, r); else pass.push(r); }
  records = [...pass, ...bySource.values()];
  const rel = records.filter((r) => r.repairType === repairType && (market == null || r.market === market));
  const count = (s: string) => rel.filter((r) => r.successStatus === s).length;
  const improvedCount = count('improved');
  const earlySignalCount = count('early_signal');
  const noChangeCount = count('no_change');
  const worsenedCount = count('worsened');
  const inconclusiveCount = count('inconclusive');
  const awaitingCount = count('awaiting_data');
  const sampleSize = rel.length;
  const decidedCount = improvedCount + noChangeCount + worsenedCount; // early_signal is not yet decided
  const successRate = decidedCount > 0 ? improvedCount / decidedCount : null;

  // confidence by decided sample size, never high if mostly undecided
  let confidence: 'low' | 'medium' | 'high';
  if (decidedCount < 3) confidence = 'low';
  else if (decidedCount <= 10) confidence = 'medium';
  else confidence = 'high';
  const mostlyUndecided = sampleSize > 0 && (awaitingCount + inconclusiveCount) / sampleSize > 0.5;
  if (mostlyUndecided && confidence === 'high') confidence = 'medium';

  const limited = decidedCount < 3;
  let note: string;
  if (sampleSize === 0) note = 'مفيش بيانات تعلّم لنوع الإصلاح ده لسه.';
  else if (limited) note = `بيانات التعلّم لسه محدودة (${decidedCount} نتيجة محسومة من ${sampleSize}).`;
  else note = `إصلاحات مشابهة تحسّنت في ${improvedCount} من ${decidedCount} حالة محسومة${market ? ' (نفس السوق)' : ''}.`;

  return {
    repairType, market: market ?? null, sampleSize,
    improvedCount, earlySignalCount, noChangeCount, worsenedCount, inconclusiveCount, awaitingCount,
    decidedCount, successRate, confidence, note, limited,
  };
}

/** Query learning records for a repair type (optionally market-scoped). */
export async function getLearning(tenantId: string, repairType: string, market?: string | null): Promise<LearningSummary> {
  const records = await withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT repair_outcome_id AS "sourceId", repair_type AS "repairType", market, success_status AS "successStatus", confidence
         FROM repair_learning_records WHERE repair_type=$1`, [repairType]);
    return r.rows as LearningRecord[];
  }).catch(() => [] as LearningRecord[]);

  // prefer market-specific if it has decided data, else fall back to all-market
  if (market) {
    const scoped = summarizeLearning(records, repairType, market);
    if (scoped.decidedCount >= 3) return scoped;
  }
  return summarizeLearning(records, repairType, null);
}

/** Roll up learning across all types (for reports/aggregation). */
export async function learningRollup(tenantId: string): Promise<LearningSummary[]> {
  const records = await withTenant(tenantId, async (c) =>
    (await c.query(`SELECT repair_outcome_id AS "sourceId", repair_type AS "repairType", market, success_status AS "successStatus", confidence FROM repair_learning_records`)).rows as LearningRecord[]
  ).catch(() => [] as LearningRecord[]);
  const types = [...new Set(records.map((r) => r.repairType))];
  return types.map((t) => summarizeLearning(records, t, null)).filter((s) => s.sampleSize > 0);
}
