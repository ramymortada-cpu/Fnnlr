-- ============================================================================
-- AUTOMATION ENGINE — tenant schema (applied to every isolated tenant DB)
-- ----------------------------------------------------------------------------
-- Durable, event-sourced automation. Lives INSIDE each tenant's own database,
-- so a tenant's automations can only ever read/act on that tenant's data.
-- ============================================================================

-- An automation = WHEN <trigger> IF <conditions> THEN <actions>, with safety.
CREATE TABLE IF NOT EXISTS automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Trigger: the event type that starts this automation (e.g. 'lead.price_sent').
  trigger_event TEXT NOT NULL,

  -- Conditions: JSON rule tree evaluated against the event + entity context.
  conditions    JSONB NOT NULL DEFAULT '[]',

  -- Actions: ordered list of steps (send_message, wait, create_task, etc.).
  actions       JSONB NOT NULL DEFAULT '[]',

  -- Safety: does any action require human approval before firing?
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Anti-spam: max times this automation may fire per entity, and cooldown.
  max_runs_per_entity INTEGER,
  cooldown_seconds    INTEGER,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_automations_trigger ON automations(trigger_event) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_automations_business ON automations(business_id);

-- A run = one execution of an automation for one entity (lead/conversation).
-- Durable: survives restarts; a scheduler picks up due steps.
CREATE TABLE IF NOT EXISTS automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,        -- lead | conversation | payment
  entity_id       UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',  -- active | waiting | awaiting_approval | done | cancelled | failed
  current_step    INTEGER NOT NULL DEFAULT 0,
  next_run_at     TIMESTAMPTZ,          -- when the next step is due (for waits)
  context         JSONB NOT NULL DEFAULT '{}',
  -- Idempotency: a hash of (automation, entity, triggering event) prevents
  -- the same trigger from starting duplicate runs.
  dedupe_key      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_dedupe ON automation_runs(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_runs_due ON automation_runs(status, next_run_at)
  WHERE status IN ('active','waiting');
CREATE INDEX IF NOT EXISTS idx_runs_entity ON automation_runs(entity_type, entity_id);

-- A step log = every action attempted, for audit, idempotency, and analytics.
CREATE TABLE IF NOT EXISTS automation_step_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  step_index    INTEGER NOT NULL,
  action_type   TEXT NOT NULL,
  status        TEXT NOT NULL,         -- ok | skipped | blocked | failed | sent_free | sent_paid
  detail        JSONB,
  -- Idempotency for sends: never send the same step twice.
  idempotency_key TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_step_idem ON automation_step_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_step_run ON automation_step_logs(run_id, step_index);

-- Approval requests raised by automations needing human sign-off before acting.
CREATE TABLE IF NOT EXISTS automation_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  step_index    INTEGER NOT NULL,
  proposed_action JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON automation_approvals(status) WHERE status='pending';
