-- ============================================================================
-- 0029_scaling_operations.sql  (Sprint 35)
-- Scheduler fan-out + leases, outbound webhook retry/backoff, event-processing
-- idempotency, and high-volume indexes. No new product features.
-- ============================================================================

-- ---- Scheduler fan-out + job lease ----------------------------------------
ALTER TABLE scheduled_runs ADD COLUMN IF NOT EXISTS parent_run_id  UUID;        -- a batch parent groups per-tenant/per-business child runs
ALTER TABLE scheduled_runs ADD COLUMN IF NOT EXISTS heartbeat_at   TIMESTAMPTZ; -- a running job updates this; lets us detect stuck runs
ALTER TABLE scheduled_runs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ; -- after this, a stuck 'running' row may be safely retried

CREATE INDEX IF NOT EXISTS idx_scheduled_runs_parent ON scheduled_runs(parent_run_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_status_lease ON scheduled_runs(status, lease_expires_at);

-- A batch (parent) record summarising a fan-out across many targets.
CREATE TABLE IF NOT EXISTS scheduled_run_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  total_targets   INTEGER NOT NULL DEFAULT 0,
  succeeded       INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  skipped         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | completed | completed_with_errors
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_run_batches_idem ON scheduled_run_batches(job_type, idempotency_key);

-- ---- Event-processing idempotency -----------------------------------------
-- The same provider event (external_id) must never be processed twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_events_external
  ON integration_events(connection_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_events_conn_ext ON integration_events(connection_id, external_id);

-- page events: a stable client-supplied event id makes tracking idempotent.
ALTER TABLE page_events ADD COLUMN IF NOT EXISTS event_key TEXT;  -- dedupe key: provided id or hash(payload+window)
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_events_key ON page_events(page_id, event_key) WHERE event_key IS NOT NULL;

-- ---- Outbound webhook retry / backoff -------------------------------------
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS max_attempts   INTEGER NOT NULL DEFAULT 6;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS next_retry_at  TIMESTAMPTZ;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS paused         BOOLEAN NOT NULL DEFAULT FALSE;
-- status now: pending | delivering | delivered | retrying | failed | abandoned
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(status, next_retry_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_deliveries_idem ON webhook_deliveries(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---- High-volume read indexes ---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_business_stage ON leads(business_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_states_lead_state ON payment_states(lead_id, state, updated_at DESC);
-- WhatsApp message idempotency: the same provider message id must not double-insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_external
  ON conversation_messages(conversation_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_messages_external ON conversation_messages(external_id);
