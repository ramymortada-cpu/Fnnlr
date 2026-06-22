-- ============================================================================
-- DATA INTEGRITY HARDENING (Sprint 31, tenant). No ws_id.
-- Every learning record must represent ONE interpretable fact tied to a single
-- source outcome — never a duplicate from a repeated measurement / daily refresh.
-- Add a source_outcome_id to each learning table and a UNIQUE constraint so the
-- write path can UPSERT instead of append. One source outcome → one learning row.
-- ============================================================================

-- ---- repair_learning_records ----
ALTER TABLE repair_learning_records ADD COLUMN IF NOT EXISTS repair_outcome_id UUID REFERENCES repair_outcomes(id) ON DELETE CASCADE;
-- backfill: collapse existing duplicates to the latest per (repair_plan_id), then enforce.
-- (safe even with no data — operates on whatever rows exist.)
DELETE FROM repair_learning_records a USING repair_learning_records b
  WHERE a.repair_outcome_id IS NULL AND b.repair_outcome_id IS NULL
    AND a.repair_plan_id = b.repair_plan_id AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_learning_outcome ON repair_learning_records(repair_outcome_id) WHERE repair_outcome_id IS NOT NULL;
-- fallback uniqueness for rows that predate outcome linkage: one per plan
CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_learning_plan ON repair_learning_records(repair_plan_id) WHERE repair_outcome_id IS NULL AND repair_plan_id IS NOT NULL;

-- ---- playbook_application_learning_records ----
ALTER TABLE playbook_application_learning_records ADD COLUMN IF NOT EXISTS application_outcome_id UUID REFERENCES playbook_application_outcomes(id) ON DELETE CASCADE;
DELETE FROM playbook_application_learning_records a USING playbook_application_learning_records b
  WHERE a.application_outcome_id IS NULL AND b.application_outcome_id IS NULL
    AND a.application_plan_id = b.application_plan_id AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pb_app_learning_outcome ON playbook_application_learning_records(application_outcome_id) WHERE application_outcome_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pb_app_learning_plan ON playbook_application_learning_records(application_plan_id) WHERE application_outcome_id IS NULL AND application_plan_id IS NOT NULL;

-- ---- opportunity_learning_records ----
ALTER TABLE opportunity_learning_records ADD COLUMN IF NOT EXISTS opportunity_outcome_id UUID REFERENCES opportunity_outcomes(id) ON DELETE CASCADE;
ALTER TABLE opportunity_learning_records ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES revenue_opportunities(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opp_learning_outcome ON opportunity_learning_records(opportunity_outcome_id) WHERE opportunity_outcome_id IS NOT NULL;

-- ---- attribution_learning_records ----
ALTER TABLE attribution_learning_records ADD COLUMN IF NOT EXISTS attribution_id UUID REFERENCES revenue_attributions(id) ON DELETE CASCADE;
ALTER TABLE attribution_learning_records ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES revenue_opportunities(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attr_learning_source ON attribution_learning_records(attribution_id) WHERE attribution_id IS NOT NULL;

-- ---- recommendation_learning_records ----
ALTER TABLE recommendation_learning_records ADD COLUMN IF NOT EXISTS recommendation_outcome_id UUID REFERENCES recommendation_outcomes(id) ON DELETE CASCADE;
ALTER TABLE recommendation_learning_records ADD COLUMN IF NOT EXISTS recommendation_id UUID REFERENCES action_recommendations(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rec_learning_outcome ON recommendation_learning_records(recommendation_outcome_id) WHERE recommendation_outcome_id IS NOT NULL;

-- ---- outcome tables themselves: one latest outcome per source entity ----
-- We keep outcome history, but learning is keyed to the SOURCE OUTCOME row that
-- itself is upserted to "latest per source" so re-measurement updates in place.
ALTER TABLE opportunity_outcomes ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE recommendation_outcomes ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opp_outcome_latest ON opportunity_outcomes(opportunity_id) WHERE is_latest;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rec_outcome_latest ON recommendation_outcomes(recommendation_id) WHERE is_latest;
