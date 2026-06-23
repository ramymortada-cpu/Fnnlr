-- ============================================================================
-- GATEFORGE GA CONTROLS (tenant)
-- ----------------------------------------------------------------------------
-- Evidence tables for AI spend/safety and customer data lifecycle operations.
-- Prompts and raw provider responses are not stored here; this is spend/status
-- telemetry only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id_label        TEXT NOT NULL,
  brain                 TEXT NOT NULL,
  provider              TEXT,
  model                 TEXT,
  estimated_tokens      INTEGER,
  estimated_cost_usd    NUMERIC,
  actual_cost_usd       NUMERIC,
  status                TEXT NOT NULL,
  degradation_reason    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_brain_time ON ai_usage_events(brain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_status_time ON ai_usage_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS data_lifecycle_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor          TEXT NOT NULL,
  action         TEXT NOT NULL,
  target         TEXT NOT NULL,
  status         TEXT NOT NULL,
  evidence       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_lifecycle_events_action_time ON data_lifecycle_events(action, created_at DESC);
