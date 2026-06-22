-- ============================================================================
-- FUNNEL CRM — lead pipeline, notes, tasks, stage history (Sprint 7, tenant)
-- Database-per-tenant: no ws_id.
-- ============================================================================

-- Lead pipeline fields.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT;                 -- free status note (e.g. needs_followup)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

-- Stage change history — the raw material the Leak Board will read later to
-- find WHERE in the funnel revenue leaks (how long leads sit at each stage).
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage    TEXT,
  to_stage      TEXT NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id, changed_at);

-- Notes on a lead.
CREATE TABLE IF NOT EXISTS lead_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at);

-- Tasks / next actions tied to a lead.
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  funnel_id   UUID REFERENCES journeys(id) ON DELETE CASCADE,
  kind        TEXT,                  -- call | whatsapp_followup | send_payment | confirm_proof | deliver | objection | mark_lost
  title       TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  due_at      TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_funnel_open ON tasks(funnel_id) WHERE done = FALSE;

-- Conversation manual fields (stub — no inbound API yet).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'opened';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS note TEXT;
