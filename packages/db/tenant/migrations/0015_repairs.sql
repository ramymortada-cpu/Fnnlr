-- ============================================================================
-- AUTONOMOUS-BUT-APPROVED REVENUE REPAIRS (Sprint 17, tenant). No ws_id.
-- A repair plan is evidence → steps → approval → execution → result tracking.
-- Nothing applies without approval; no auto-send; no auto mark-fixed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS repair_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  leak_id               UUID REFERENCES leak_findings(id) ON DELETE SET NULL,
  source_event_id       UUID,
  type                  TEXT NOT NULL,   -- payment_recovery | whatsapp_first_reply | whatsapp_followup | page_cta_fix | page_hero_fix | tracking_fix | followup_fix | access_delivery_fix | attribution_fix
  status                TEXT NOT NULL DEFAULT 'proposed',  -- proposed | approved | in_progress | applied | partially_applied | rejected | failed
  title                 TEXT NOT NULL,
  explanation           TEXT,
  evidence              JSONB DEFAULT '{}',
  affected_objects      JSONB DEFAULT '{}',
  expected_impact       TEXT,            -- qualitative only; NEVER a fabricated number
  risk_level            TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  -- result tracking baseline (captured at apply time; no fake impact)
  baseline              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at           TIMESTAMPTZ,
  applied_at            TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_repair_plans_journey ON repair_plans(journey_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_plan_id  UUID NOT NULL REFERENCES repair_plans(id) ON DELETE CASCADE,
  step_type       TEXT NOT NULL,   -- create_task | draft_whatsapp | update_page_section | update_offer | update_payment_instruction | create_tracked_link | mark_leak_fixing | open_filtered_view | generate_report_note
  title           TEXT NOT NULL,
  description     TEXT,
  payload         JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | applied | skipped | failed
  before_snapshot JSONB,
  after_snapshot  JSONB,
  error           TEXT,
  step_order      INTEGER NOT NULL DEFAULT 0,
  result_summary  TEXT,
  affected_count  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_steps_plan ON repair_steps(repair_plan_id, step_order);
