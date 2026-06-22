-- ============================================================================
-- EVIDENCE-WEIGHTED REPAIR PLANNER (Sprint 19, tenant). No ws_id.
-- Records how a plan's order/strategy was chosen and what learning informed it.
-- Honest: strategy_source distinguishes heuristic vs learned vs mixed.
-- ============================================================================

ALTER TABLE repair_plans ADD COLUMN IF NOT EXISTS learning_confidence  TEXT;   -- low | medium | high
ALTER TABLE repair_plans ADD COLUMN IF NOT EXISTS learning_notes       JSONB DEFAULT '{}';
ALTER TABLE repair_plans ADD COLUMN IF NOT EXISTS alternative_strategy JSONB DEFAULT '{}';
ALTER TABLE repair_plans ADD COLUMN IF NOT EXISTS selected_strategy    TEXT DEFAULT 'primary';  -- primary | alternative
ALTER TABLE repair_plans ADD COLUMN IF NOT EXISTS strategy_source      TEXT DEFAULT 'heuristic'; -- heuristic | learned | mixed

ALTER TABLE repair_steps ADD COLUMN IF NOT EXISTS weight         NUMERIC DEFAULT 0;
ALTER TABLE repair_steps ADD COLUMN IF NOT EXISTS evidence_score NUMERIC DEFAULT 0;
ALTER TABLE repair_steps ADD COLUMN IF NOT EXISTS learning_score NUMERIC DEFAULT 0;
ALTER TABLE repair_steps ADD COLUMN IF NOT EXISTS step_reason    TEXT;
