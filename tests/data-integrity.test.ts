import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLearning, dedupeBySource, type LearningRecord } from '../modules/opportunities/src/outcome-engine.js';
import { aggregateAttribution, type AttrLearningRecord } from '../modules/attribution/src/engine.js';
import { aggregateRecLearning, type RecLearningRecord } from '../modules/recommendations/src/outcome-engine.js';
import { summarizeLearning, type LearningRecord as RepairLearningRecord } from '../modules/repairs/src/learning.js';
import { buildAllPlaybooks, type LearningInput } from '../modules/playbooks/src/builder.js';

/**
 * Sprint 31 — Data Integrity Hardening. The write paths now UPSERT one learning
 * record per source (enforced by unique constraints in migration 0028). These
 * tests prove the PURE aggregators are also defense-in-depth: fed duplicated raw
 * rows for the same source, they collapse to a unique-source count and never
 * inflate sample size or confidence. (DB-write dedup is covered by the live-DB
 * isolation suite; here we prove the math can't be fooled.)
 */

// ---- generic helper ----
test('dedupeBySource keeps one record per source (latest wins), passes through null sources', () => {
  const out = dedupeBySource([
    { sourceId: 'a', opportunityType: 'x', status: 'awaiting_evidence' },
    { sourceId: 'a', opportunityType: 'x', status: 'captured' },   // same source, later → wins
    { sourceId: 'b', opportunityType: 'x', status: 'captured' },
    { opportunityType: 'x', status: 'missed' },                    // no source → passthrough
  ] as LearningRecord[]);
  assert.equal(out.length, 3);
  assert.equal(out.find((r) => (r as any).sourceId === 'a')!.status, 'captured');
});

// ---- opportunity learning ----
test('opportunity: same source repeated daily does NOT inflate sample size', () => {
  // one opportunity checked 10 times while awaiting, then captured once — all same source
  const dup: LearningRecord[] = Array.from({ length: 10 }, () => ({ sourceId: 'opp1-out', opportunityType: 'waiting_payment_recovery', status: 'awaiting_evidence' }));
  dup.push({ sourceId: 'opp1-out', opportunityType: 'waiting_payment_recovery', status: 'awaiting_evidence' });
  const agg = aggregateLearning(dup)[0];
  assert.equal(agg.detected, 1);          // collapsed to one source
  assert.equal(agg.decided, 0);           // awaiting never decided
  assert.equal(agg.captureRate, null);
});

test('opportunity: captured rechecked daily counts once; confidence stays low under duplicates', () => {
  const dup: LearningRecord[] = Array.from({ length: 15 }, () => ({ sourceId: 'opp1-out', opportunityType: 'x', status: 'captured', capturedValue: 500 }));
  const agg = aggregateLearning(dup)[0];
  assert.equal(agg.captured, 1);
  assert.equal(agg.decided, 1);
  assert.equal(agg.knownValueCaptured, 500);   // not 15×500
  assert.equal(agg.confidence, 'low');         // one source is not a big sample
});

test('opportunity: awaiting does not raise capture rate even at high volume', () => {
  const recs: LearningRecord[] = [
    ...Array.from({ length: 3 }, (_, i) => ({ sourceId: `c${i}`, opportunityType: 'x', status: 'captured' as const })),
    ...Array.from({ length: 50 }, (_, i) => ({ sourceId: `a${i}`, opportunityType: 'x', status: 'awaiting_evidence' as const })),
  ];
  const agg = aggregateLearning(recs)[0];
  assert.equal(agg.decided, 3);
  assert.equal(agg.captureRate, 1);            // 3/3 decided, awaiting excluded
  assert.notEqual(agg.confidence, 'high');     // mostly-undecided caps confidence
});

// ---- attribution learning ----
test('attribution: same attribution run twice does not double count', () => {
  const dup: AttrLearningRecord[] = [
    { sourceId: 'attr1', attributedActionType: 'payment_reminder_drafted', captured: true, capturedValue: 300 },
    { sourceId: 'attr1', attributedActionType: 'payment_reminder_drafted', captured: true, capturedValue: 300 },
  ];
  const agg = aggregateAttribution(dup)[0];
  assert.equal(agg.attempts, 1);
  assert.equal(agg.capturedCount, 1);
  assert.equal(agg.knownValueCaptured, 300);
});

test('attribution: unknown does not inflate strong-action confidence', () => {
  const recs: AttrLearningRecord[] = [
    { sourceId: 's1', attributedActionType: 'payment_reminder_drafted', captured: true },
    ...Array.from({ length: 30 }, (_, i) => ({ sourceId: `u${i}`, attributedActionType: 'unknown', captured: true })),
  ];
  const agg = aggregateAttribution(recs);
  const pr = agg.find((a) => a.attributedActionType === 'payment_reminder_drafted')!;
  assert.equal(pr.attempts, 1);                // unknown excluded entirely
  assert.equal(agg.find((a) => a.attributedActionType === 'unknown'), undefined);
});

// ---- recommendation learning ----
test('recommendation: same outcome rechecked twice does not inflate sample', () => {
  const dup: RecLearningRecord[] = Array.from({ length: 8 }, () => ({ sourceId: 'rec1-out', recommendationType: 'draft_payment_reminder', status: 'awaiting_evidence' }));
  dup.push({ sourceId: 'rec1-out', recommendationType: 'draft_payment_reminder', status: 'worked' });  // latest wins
  const agg = aggregateRecLearning(dup)[0];
  assert.equal(agg.recommended, 1);
  assert.equal(agg.worked, 1);
  assert.equal(agg.decided, 1);
});

test('recommendation: no high confidence from duplicated single source', () => {
  const dup: RecLearningRecord[] = Array.from({ length: 40 }, () => ({ sourceId: 'rec1-out', recommendationType: 'x', status: 'worked' }));
  const agg = aggregateRecLearning(dup)[0];
  assert.equal(agg.decided, 1);
  assert.equal(agg.confidence, 'low');
});

// ---- repair learning ----
test('repair: measuring same outcome twice yields one source in the sample', () => {
  const dup: RepairLearningRecord[] = [
    { sourceId: 'rep1-out', repairType: 'page', market: null, successStatus: 'awaiting_data', confidence: 'low' },
    { sourceId: 'rep1-out', repairType: 'page', market: null, successStatus: 'improved', confidence: 'medium' },
  ];
  const s = summarizeLearning(dup, 'page', null);
  assert.equal(s.sampleSize, 1);
  assert.equal(s.improvedCount, 1);
  assert.equal(s.decidedCount, 1);
});

// ---- playbook builder ----
test('playbook builder uses deduped data (duplicate sources do not inflate sample size)', () => {
  const dup: LearningInput[] = Array.from({ length: 12 }, () => ({ sourceId: 'rep1-out', repairType: 'page', market: null, successStatus: 'improved' }));
  const books = buildAllPlaybooks(dup, null);
  const page = books.find((b) => b.playbookType === 'page')!;
  assert.equal(page.sampleSize, 1);     // 12 duplicate rows → one source
});

test('playbook builder: distinct sources still counted independently', () => {
  const recs: LearningInput[] = Array.from({ length: 6 }, (_, i) => ({ sourceId: `s${i}`, repairType: 'page', market: null, successStatus: 'improved' }));
  const page = buildAllPlaybooks(recs, null).find((b) => b.playbookType === 'page')!;
  assert.equal(page.sampleSize, 6);
});
