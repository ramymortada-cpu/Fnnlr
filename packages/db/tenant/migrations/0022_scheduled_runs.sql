-- ============================================================================
-- SCHEDULED INTELLIGENCE + OPERATING RHYTHM (Sprint 24, tenant). No ws_id.
-- Lightweight, idempotent, auditable scheduled jobs that produce records inside
-- fnnlr. No external sending, no auto-apply, no fabricated results.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        TEXT NOT NULL,   -- daily_business_refresh | weekly_business_report | funnel_leak_refresh | portfolio_analysis_refresh | repair_outcome_due_check | playbook_application_outcome_due_check | action_center_refresh | stale_data_check
  target_type     TEXT NOT NULL,   -- workspace | business | funnel
  target_id       UUID,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed | skipped
  idempotency_key TEXT NOT NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  error           TEXT,
  summary         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- idempotency: one run per (job_type, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_runs_idem ON scheduled_runs(job_type, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_recent ON scheduled_runs(job_type, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_run_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES scheduled_runs(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL,
  item_id       UUID,
  status        TEXT NOT NULL DEFAULT 'completed',  -- completed | skipped | failed
  message       TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_run_items_run ON scheduled_run_items(run_id, created_at);

-- stale handling for intelligence artifacts (minimal fields)
ALTER TABLE portfolio_insights ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portfolio_insights ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT FALSE;
