-- ============================================================================
-- PLAYBOOK APPLICATION ENGINE (Sprint 21, tenant). No ws_id.
-- Apply a learned playbook to an EXISTING funnel: compare current vs recommended,
-- build a change plan, preview diffs, approve, then apply safe steps one-by-one.
-- No auto-apply. No destructive overwrite. Confidence is honest.
-- ============================================================================

CREATE TABLE IF NOT EXISTS playbook_application_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  playbook_id     UUID REFERENCES adaptive_playbooks(id) ON DELETE SET NULL,
  scope           TEXT NOT NULL DEFAULT 'all',  -- all | offer | page | whatsapp | payment | followup | funnel
  status          TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | applied | partially_applied | rejected | failed
  confidence      TEXT NOT NULL DEFAULT 'low',
  learning_notes  JSONB DEFAULT '{}',
  before_snapshot JSONB,
  after_snapshot  JSONB,
  changes         JSONB DEFAULT '{}',
  risk_level      TEXT NOT NULL DEFAULT 'low',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ,
  applied_at      TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pb_app_plans_funnel ON playbook_application_plans(funnel_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS playbook_application_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES playbook_application_plans(id) ON DELETE CASCADE,
  object_type     TEXT NOT NULL,   -- offer | page | whatsapp | payment | followup | funnel
  object_id       UUID,
  change_type     TEXT NOT NULL,
  title           TEXT NOT NULL,
  explanation     TEXT,
  before_state    JSONB,
  after_state     JSONB,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | applied | skipped | failed
  error           TEXT,
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  low_confidence  BOOLEAN NOT NULL DEFAULT FALSE,
  step_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pb_app_steps_plan ON playbook_application_steps(plan_id, step_order);
