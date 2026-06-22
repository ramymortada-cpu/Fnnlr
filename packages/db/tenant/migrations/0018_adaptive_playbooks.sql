-- ============================================================================
-- ADAPTIVE REVENUE PLAYBOOKS (Sprint 20, tenant). No ws_id.
-- Turn accumulated learning into playbooks that shape funnel/offer/page/
-- whatsapp/payment/followup construction. Honest confidence; no fake wisdom.
-- ============================================================================

CREATE TABLE IF NOT EXISTS adaptive_playbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL DEFAULT 'global',  -- global | market | funnel_type | product_type | payment_method
  playbook_type   TEXT NOT NULL,                   -- funnel | offer | page | whatsapp | payment | followup
  market          TEXT,
  funnel_type     TEXT,
  product_type    TEXT,
  payment_method  TEXT,
  recommendation  JSONB DEFAULT '{}',
  evidence_summary JSONB DEFAULT '{}',
  sample_size     INTEGER NOT NULL DEFAULT 0,
  confidence      TEXT NOT NULL DEFAULT 'low',      -- low | medium | high
  status          TEXT NOT NULL DEFAULT 'active',   -- draft | active | archived
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adaptive_playbooks_type ON adaptive_playbooks(playbook_type, scope, status);

CREATE TABLE IF NOT EXISTS playbook_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id     UUID REFERENCES adaptive_playbooks(id) ON DELETE CASCADE,
  funnel_id       UUID REFERENCES journeys(id) ON DELETE CASCADE,
  object_type     TEXT,            -- funnel | offer | page | whatsapp | payment | followup
  object_id       UUID,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by      TEXT,
  effect_observed TEXT,
  metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_playbook_applications_funnel ON playbook_applications(funnel_id, applied_at DESC);
