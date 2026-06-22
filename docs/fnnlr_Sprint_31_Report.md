# fnnlr — Sprint 31 Report (Data Integrity Hardening)

The Sprint 30 audit's highest-severity finding was **learning-record inflation**: outcome checks appended a *new* learning record on every measurement, and the scheduler re-checks every open item daily — so one opportunity sitting `awaiting_evidence` for 10 days produced 10 learning rows, silently inflating sample size and corrupting the confidence math that is fnnlr's moat. Sprint 31 fixes this at the root: **every learning record is now one interpretable fact tied to a single source, enforced by unique constraints, written by UPSERT, and the aggregators dedupe by source as defense-in-depth.** No new features. **314 tests, 312 pass, 0 fail, 2 skip. Typecheck clean.**

## 1. Truth table (before the fix)

| Learning table | Source outcome | Had source_id? | Unique? | Could duplicate? | Aggregation read |
|---|---|---|---|---|---|
| repair_learning_records | repair_outcomes | plan_id only | ❌ | **yes** | raw rows |
| playbook_application_learning_records | playbook_application_outcomes | plan_id only | ❌ | **yes** | raw rows |
| opportunity_learning_records | opportunity_outcomes | ❌ none | ❌ | **yes** | raw rows |
| attribution_learning_records | revenue_attributions | ❌ none | ❌ | **yes** | raw rows |
| recommendation_learning_records | recommendation_outcomes | ❌ none | ❌ | **yes** | raw rows |

All five were append-only with no source identity. All five were vulnerable.

## 2. Learning tables fixed (all five)

Each learning table now carries a **source-outcome FK** and a **partial unique index** on it (migration 0028):
- `repair_learning_records.repair_outcome_id` → `uq_repair_learning_outcome`
- `playbook_application_learning_records.application_outcome_id` → `uq_pb_app_learning_outcome`
- `opportunity_learning_records.opportunity_outcome_id` (+ `opportunity_id`) → `uq_opp_learning_outcome`
- `attribution_learning_records.attribution_id` (+ `opportunity_id`) → `uq_attr_learning_source`
- `recommendation_learning_records.recommendation_outcome_id` (+ `recommendation_id`) → `uq_rec_learning_outcome`

The two history-bearing outcome tables also gained a single **latest row per source**: `opportunity_outcomes.is_latest` and `recommendation_outcomes.is_latest`, each with a partial unique index (`uq_opp_outcome_latest`, `uq_rec_outcome_latest`). History is preserved (older rows kept with `is_latest=false`); learning stays 1:1 with the latest.

## 3. Migration & constraints added

**Migration 0028 (`0028_data_integrity_hardening.sql`)** — adds the source columns, partial unique indexes, `is_latest` flags, and a **safe backfill** that collapses any pre-existing duplicate learning rows to one-per-source via `ctid` before the constraints apply (safe no-op on an empty/seed DB).

## 4. Services: INSERT → UPSERT (all five write paths)

- **`checkOpportunityOutcome` + `markOutcome`** (`modules/opportunities/src/outcomes.ts`): demote prior `is_latest`, insert the new latest outcome `RETURNING id`, insert the learning row `ON CONFLICT (opportunity_outcome_id) DO NOTHING`, then **collapse** older learning rows for that opportunity. One learning row per opportunity, latest status wins.
- **`checkRecommendationOutcome` + `markRecOutcome`** (`modules/recommendations/src/outcomes.ts`): same demote + upsert + collapse keyed on `recommendation_outcome_id` / `recommendation_id`.
- **`runAttribution`** (`modules/attribution/src/service.ts`): clears any prior attribution + its learning for the opportunity, then writes fresh — re-running on the same capture updates rather than double-counts. One attribution + one learning per opportunity capture.
- **`measureRepairOutcome`** (`modules/repairs/src/outcomes.ts`): learning keyed on `repair_outcome_id`, collapsed to one-per-plan.
- **`measureApplicationOutcome`** (`modules/playbooks/src/app-outcomes.ts`): learning keyed on `application_outcome_id`, collapsed to one-per-plan.

## 5. Aggregators: deduped / latest-aware

The unique constraints already guarantee no physical duplicates, but every pure aggregator now **dedupes by source internally** so the math cannot be fooled even if fed duplicated rows:
- `aggregateLearning` (opportunity) — `dedupeBySource` helper; reads now select `opportunity_outcome_id AS sourceId`.
- `aggregateAttribution` — dedupes on `attribution_id`; reads select it as `sourceId`.
- `aggregateRecLearning` — dedupes on `recommendation_outcome_id`.
- `summarizeLearning` + `learningRollup` (repair) — dedupe on `repair_outcome_id`.
- `buildAllPlaybooks` (playbook builder) — dedupes on the folded `repair_outcome_id` / `application_outcome_id`, so playbook `sample_size` is a unique-source count.

All retain the prior honesty discipline: success/capture/work rate over **decided** outcomes only; `awaiting`/`inconclusive` never raise the rate; confidence never `high` when mostly undecided.

## 6. Proof that double refresh doesn't change sample size

New suite `tests/data-integrity.test.ts` (11 tests) proves it directly on the pure aggregators:
- opportunity checked 10× while awaiting → `detected = 1`, `decided = 0`, `captureRate = null`.
- captured rechecked 15× → `captured = 1`, `knownValueCaptured = 500` (not 15×500), confidence `low`.
- attribution run twice → `attempts = 1`.
- recommendation rechecked 8× awaiting then worked → `recommended = 1`, `worked = 1`.
- repair measured twice → `sampleSize = 1`.
- playbook builder fed 12 duplicate-source rows → `sampleSize = 1`; 6 distinct sources → `sampleSize = 6`.
- awaiting at high volume never raises capture rate or grants high confidence.

Because the scheduler's daily refresh calls these same `check*`/`measure*` functions (each now collapsing to one learning row per source), **running the daily refresh twice cannot increase any learning sample** — the second run demotes the prior latest outcome and the collapse-DELETE keeps exactly one learning row per source.

## 7. Reporting honesty

Weekly report, playbook screen, opportunity learning notes, recommendation cards, and the attribution insights panel all read through the now-deduped aggregators, so none can display an inflated count or a duplication-driven high confidence. The outcome *summaries* already used `DISTINCT ON (… latest)`; they remain correct and now agree with the learning layer.

## Acceptance — all met
Every learning record tied to a source identity ✓ · unique constraints prevent duplicates ✓ · all learning writes upsert ✓ · all aggregators deduped/latest-aware ✓ · repeated measurement doesn't inflate sample ✓ · double scheduled refresh safe ✓ · confidence can't rise from duplicates ✓ · reports/UI show no inflated learning ✓ · tests green (314) ✓ · no new features ✓.

## Remaining risk
- The **collapse-DELETE + write run inside the same tenant scope** but are not wrapped in an explicit SQL transaction; under a hard crash between the insert and the collapse, a transient extra learning row could persist until the next check (which would re-collapse it). Low severity, self-healing. Wrapping `check*`/`measure*` in a transaction is a clean follow-up (candidate for Sprint 32's live-plane work).
- The unique-constraint enforcement is only **exercised against a real Postgres** in the (still-skipped) isolation suite. The dedup *math* is proven here; the *DB constraint* behavior should be validated in Sprint 32 when CI gets an ephemeral Postgres.

## Next: Sprint 32 — Live Plane Validation (ephemeral Postgres in CI, un-skip isolation tests, wrap outcome writes in transactions, run one real WhatsApp + payment webhook end-to-end, fail-closed encryption).
