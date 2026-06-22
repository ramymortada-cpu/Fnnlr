-- ============================================================================
-- REVENUE ATTRIBUTION ENGINE (Sprint 27, tenant). No ws_id.
-- Associate a capture with the nearest, strongest action BY EVIDENCE. This is
-- evidence-weighted association, not causal proof. No fabricated causality.
-- ============================================================================

-- need a completion timestamp on tasks for attribution windows
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS revenue_attributions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id         UUID REFERENCES revenue_opportunities(id) ON DELETE CASCADE,
  lead_id                UUID REFERENCES leads(id) ON DELETE SET NULL,
  funnel_id              UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id            UUID REFERENCES businesses(id) ON DELETE CASCADE,
  captured_event_type    TEXT,
  captured_at            TIMESTAMPTZ,
  captured_value         NUMERIC,
  currency               TEXT,
  attributed_action_type TEXT NOT NULL,   -- task_completed | whatsapp_reply_marked_sent | payment_reminder_drafted | proof_review_task | access_delivery_task | repair_plan_applied | playbook_application_applied | page_section_updated | offer_updated | command_applied | scheduled_action | unknown
  attributed_object_id   UUID,
  attribution_strength   TEXT NOT NULL DEFAULT 'none',  -- none | weak | medium | strong
  confidence             TEXT NOT NULL DEFAULT 'low',
  time_delta_minutes     INTEGER,
  evidence               JSONB DEFAULT '{}',
  explanation            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rev_attr_opp ON revenue_attributions(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_attr_action ON revenue_attributions(attributed_action_type, attribution_strength);

CREATE TABLE IF NOT EXISTS attribution_learning_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attributed_action_type TEXT NOT NULL,
  opportunity_type       TEXT,
  market                 TEXT,
  funnel_type            TEXT,
  captured               BOOLEAN NOT NULL DEFAULT FALSE,
  captured_value         NUMERIC,
  confidence             TEXT NOT NULL DEFAULT 'low',
  time_delta_minutes     INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attr_learning_action ON attribution_learning_records(attributed_action_type, opportunity_type);
