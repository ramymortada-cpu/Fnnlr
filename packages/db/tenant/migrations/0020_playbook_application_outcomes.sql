-- ============================================================================
-- PLAYBOOK APPLICATION OUTCOME LOOP (Sprint 22, tenant). No ws_id.
-- Measure whether applying a playbook to a funnel actually worked, from
-- observed data, and feed the result back into learning. No fabricated impact.
-- ============================================================================

CREATE TABLE IF NOT EXISTS playbook_application_outcomes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_plan_id     UUID NOT NULL REFERENCES playbook_application_plans(id) ON DELETE CASCADE,
  funnel_id               UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  playbook_id             UUID REFERENCES adaptive_playbooks(id) ON DELETE SET NULL,
  scope                   TEXT NOT NULL,   -- all | offer | page | whatsapp | payment | followup | funnel
  measured_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_start            TIMESTAMPTZ,
  window_end              TIMESTAMPTZ,
  status                  TEXT NOT NULL,   -- awaiting_data | early_signal | improved | no_change | worsened | inconclusive
  baseline_metrics        JSONB DEFAULT '{}',
  current_metrics         JSONB DEFAULT '{}',
  delta_metrics           JSONB DEFAULT '{}',
  confidence              TEXT NOT NULL DEFAULT 'low',
  interpretation          TEXT,
  recommended_next_action TEXT,
  confirmed               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pb_app_outcomes_plan ON playbook_application_outcomes(application_plan_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_pb_app_outcomes_funnel ON playbook_application_outcomes(funnel_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS playbook_application_learning_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_type       TEXT NOT NULL,   -- maps from scope
  market              TEXT,
  funnel_type         TEXT,
  product_type        TEXT,
  scope               TEXT NOT NULL,
  status              TEXT NOT NULL,
  confidence          TEXT NOT NULL,
  delta_metrics       JSONB DEFAULT '{}',
  application_plan_id  UUID REFERENCES playbook_application_plans(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pb_app_learning_type ON playbook_application_learning_records(playbook_type, status);

-- baseline captured at apply time lives on the plan (alongside before_snapshot)
ALTER TABLE playbook_application_plans ADD COLUMN IF NOT EXISTS baseline_metrics JSONB;
