-- ============================================================================
-- OPPORTUNITY CAPTURE LEARNING LOOP (Sprint 26, tenant). No ws_id.
-- Measure which detected opportunities actually convert, from observed evidence,
-- and feed it back into ranking. No fabricated revenue, no fabricated capture.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_outcomes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id           UUID NOT NULL REFERENCES revenue_opportunities(id) ON DELETE CASCADE,
  funnel_id                UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id              UUID REFERENCES businesses(id) ON DELETE CASCADE,
  opportunity_type         TEXT NOT NULL,
  detected_at              TIMESTAMPTZ,
  acted_at                 TIMESTAMPTZ,
  resolved_at              TIMESTAMPTZ,
  outcome_status           TEXT NOT NULL,   -- awaiting_evidence | captured | missed | expired | inconclusive
  captured_value           NUMERIC,         -- only when an observed amount exists
  value_currency           TEXT,
  evidence                 JSONB DEFAULT '{}',
  action_taken             JSONB DEFAULT '{}',
  time_to_action_minutes   INTEGER,
  time_to_capture_minutes  INTEGER,
  confidence               TEXT NOT NULL DEFAULT 'low',
  interpretation           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opp_outcomes_opp ON opportunity_outcomes(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opp_outcomes_type ON opportunity_outcomes(opportunity_type, outcome_status);

CREATE TABLE IF NOT EXISTS opportunity_learning_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_type            TEXT NOT NULL,
  market                      TEXT,
  funnel_type                 TEXT,
  source                      TEXT,
  status                      TEXT NOT NULL,   -- captured | missed | expired | inconclusive | awaiting_evidence
  confidence                  TEXT NOT NULL,
  captured_value              NUMERIC,
  time_to_capture_minutes     INTEGER,
  priority_score_at_detection INTEGER,
  action_type_taken           TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opp_learning_type ON opportunity_learning_records(opportunity_type, status);

-- track action + resolution timing on the opportunity itself (for outcome timing)
ALTER TABLE revenue_opportunities ADD COLUMN IF NOT EXISTS acted_at TIMESTAMPTZ;
ALTER TABLE revenue_opportunities ADD COLUMN IF NOT EXISTS last_outcome_status TEXT;
