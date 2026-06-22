-- ============================================================================
-- REVENUE OPPORTUNITY ENGINE (Sprint 25, tenant). No ws_id.
-- Turn real records into prioritized, evidence-backed revenue opportunities.
-- No fabricated revenue: estimated_value only when an observed deal value exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_opportunities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id          UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id        UUID REFERENCES businesses(id) ON DELETE CASCADE,
  opportunity_type   TEXT NOT NULL,   -- waiting_payment_recovery | proof_review | access_delivery | whatsapp_first_reply | followup_reactivation | leak_repair | playbook_application | payment_method_fix | page_cta_fix | high_intent_lead
  dedupe_key         TEXT NOT NULL,   -- stable key per (type + primary object) for idempotent regeneration
  title              TEXT NOT NULL,
  explanation        TEXT,
  evidence           JSONB DEFAULT '{}',
  affected_objects   JSONB DEFAULT '[]',
  estimated_value    NUMERIC,         -- ONLY set when an observed amount exists
  value_currency     TEXT,
  confidence         TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  priority_score     INTEGER NOT NULL DEFAULT 0,
  urgency            TEXT NOT NULL DEFAULT 'low',   -- low | medium | high | critical
  recommended_action TEXT,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | captured | dismissed | expired
  source             TEXT NOT NULL DEFAULT 'lead',  -- lead | payment_state | leak | repair | action | portfolio | scheduled
  linked_task_id     UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);
-- one live opportunity per dedupe_key (idempotent regeneration; closed ones don't block)
CREATE UNIQUE INDEX IF NOT EXISTS uq_revopp_dedupe_open ON revenue_opportunities(dedupe_key)
  WHERE status IN ('open','in_progress');
CREATE INDEX IF NOT EXISTS idx_revopp_funnel ON revenue_opportunities(funnel_id, status, priority_score DESC);

CREATE TABLE IF NOT EXISTS opportunity_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES revenue_opportunities(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  changed_by      TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opp_status_history ON opportunity_status_history(opportunity_id, created_at);
