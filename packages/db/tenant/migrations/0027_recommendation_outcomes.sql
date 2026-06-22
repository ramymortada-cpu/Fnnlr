-- ============================================================================
-- RECOMMENDATION OUTCOME LOOP (Sprint 29, tenant). No ws_id.
-- Measure whether applied recommendations actually produced a result, by
-- evidence, and feed it back into recommendation ranking. No fake success,
-- no fake revenue, no causal claim without attribution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id           UUID NOT NULL REFERENCES action_recommendations(id) ON DELETE CASCADE,
  opportunity_id              UUID REFERENCES revenue_opportunities(id) ON DELETE SET NULL,
  funnel_id                   UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id                 UUID REFERENCES businesses(id) ON DELETE CASCADE,
  recommendation_type         TEXT NOT NULL,
  applied_at                  TIMESTAMPTZ,
  measured_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_start                TIMESTAMPTZ,
  window_end                  TIMESTAMPTZ,
  status                      TEXT NOT NULL,   -- awaiting_evidence | early_signal | worked | no_result | failed | dismissed | inconclusive
  evidence                    JSONB DEFAULT '{}',
  baseline_metrics            JSONB DEFAULT '{}',
  current_metrics             JSONB DEFAULT '{}',
  delta_metrics               JSONB DEFAULT '{}',
  attributed_to_recommendation BOOLEAN NOT NULL DEFAULT FALSE,
  attribution_id              UUID,
  captured_value              NUMERIC,
  currency                    TEXT,
  confidence                  TEXT NOT NULL DEFAULT 'low',
  interpretation              TEXT,
  recommended_next_action     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_rec ON recommendation_outcomes(recommendation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_type ON recommendation_outcomes(recommendation_type, status);

CREATE TABLE IF NOT EXISTS recommendation_learning_records (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type             TEXT NOT NULL,
  opportunity_type                TEXT,
  attributed_action_type          TEXT,
  market                          TEXT,
  funnel_type                     TEXT,
  status                          TEXT NOT NULL,
  confidence                      TEXT NOT NULL,
  captured_value                  NUMERIC,
  time_to_result_minutes          INTEGER,
  priority_score_at_recommendation INTEGER,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_learning_type ON recommendation_learning_records(recommendation_type, status);

-- track last measured status on the recommendation itself
ALTER TABLE action_recommendations ADD COLUMN IF NOT EXISTS last_outcome_status TEXT;
