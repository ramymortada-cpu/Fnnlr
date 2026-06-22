-- ============================================================================
-- REPAIR IMPACT MEASUREMENT + LEARNING LOOP (Sprint 18, tenant). No ws_id.
-- Measure whether a repair worked from observed data — never fabricate impact.
-- ============================================================================

CREATE TABLE IF NOT EXISTS repair_outcomes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_plan_id         UUID NOT NULL REFERENCES repair_plans(id) ON DELETE CASCADE,
  journey_id             UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  leak_id                UUID REFERENCES leak_findings(id) ON DELETE SET NULL,
  measured_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_start           TIMESTAMPTZ,
  window_end             TIMESTAMPTZ,
  status                 TEXT NOT NULL,   -- awaiting_data | early_signal | improved | no_change | worsened | inconclusive
  baseline_metrics       JSONB DEFAULT '{}',
  current_metrics        JSONB DEFAULT '{}',
  delta_metrics          JSONB DEFAULT '{}',
  interpretation         TEXT,
  confidence             TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  recommended_next_action TEXT,
  confirmed              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_outcomes_plan ON repair_outcomes(repair_plan_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_outcomes_journey ON repair_outcomes(journey_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS repair_metric_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_plan_id  UUID NOT NULL REFERENCES repair_plans(id) ON DELETE CASCADE,
  metric_key      TEXT NOT NULL,
  value           NUMERIC,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT,            -- baseline | current
  metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_repair_metric_snapshots_plan ON repair_metric_snapshots(repair_plan_id, metric_key);

-- Learning loop: one structured record per measured outcome (for future benchmarks).
CREATE TABLE IF NOT EXISTS repair_learning_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_plan_id  UUID REFERENCES repair_plans(id) ON DELETE CASCADE,
  repair_type     TEXT NOT NULL,
  market          TEXT,
  product_type    TEXT,
  funnel_type     TEXT,
  success_status  TEXT NOT NULL,   -- improved | early_signal | no_change | worsened | inconclusive | awaiting_data
  confidence      TEXT NOT NULL,
  metrics_delta   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_learning_type ON repair_learning_records(repair_type, success_status);
