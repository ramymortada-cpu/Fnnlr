-- ============================================================================
-- AI WORKFLOW INTELLIGENCE LINKAGE (tenant)
-- ----------------------------------------------------------------------------
-- Optional linkage fields that convert AI spend telemetry into workflow and
-- outcome intelligence. These columns are nullable so gateway calls that do not
-- have workflow context remain valid.
-- ============================================================================

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS outcome_id TEXT,
  ADD COLUMN IF NOT EXISTS outcome_status TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_workflow_time
  ON ai_usage_events(workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_outcome_status_time
  ON ai_usage_events(outcome_status, created_at DESC)
  WHERE outcome_status IS NOT NULL;
