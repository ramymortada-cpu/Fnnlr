-- ============================================================================
-- AI COMMAND BAR — command history / audit (Sprint 12, tenant). No ws_id.
-- A log for trust + debugging, NOT analytics. Every command and its result.
-- ============================================================================

CREATE TABLE IF NOT EXISTS commands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID REFERENCES journeys(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  leak_id         UUID REFERENCES leak_findings(id) ON DELETE SET NULL,
  command_text    TEXT NOT NULL,
  intent          TEXT,
  confidence      TEXT,
  result_type     TEXT,                 -- informational | navigation | draft | update | task | status | bulk | clarify
  proposed        JSONB DEFAULT '{}',   -- the proposed action / preview / affected objects
  status          TEXT NOT NULL DEFAULT 'proposed',  -- proposed | applied | discarded
  degraded        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_commands_journey ON commands(journey_id, created_at DESC);
