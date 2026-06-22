-- ============================================================================
-- ACTION CENTER + WEEKLY REPORT (Sprint 11, tenant). No ws_id.
-- Every action/report row references a REAL record — no generic items.
-- ============================================================================

CREATE TABLE IF NOT EXISTS action_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id         UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  lead_id            UUID REFERENCES leads(id) ON DELETE CASCADE,
  leak_id            UUID REFERENCES leak_findings(id) ON DELETE CASCADE,
  task_id            UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,        -- follow_up_lead | review_payment_proof | confirm_payment | deliver_access | contact_whatsapp_click | fix_tracking | publish_page | create_tracked_link | add_payment_method | use_whatsapp_template | resolve_leak | mark_lost_reason | add_next_action
  title              TEXT NOT NULL,
  explanation        TEXT,
  priority           INTEGER NOT NULL DEFAULT 0,   -- higher = more urgent
  due_at             TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | done | snoozed | ignored
  recommended_action TEXT,
  target_route       TEXT,                 -- where the UI should open
  evidence           JSONB DEFAULT '{}',
  code               TEXT,                 -- stable dedup key per (journey, code)
  snooze_until       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_items_journey ON action_items(journey_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  summary         TEXT,
  biggest_leak_id UUID REFERENCES leak_findings(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'generated',  -- draft | generated | reviewed | archived
  ai_output_id    UUID,
  metadata        JSONB DEFAULT '{}',
  degraded        BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_journey ON reports(journey_id, generated_at DESC);
