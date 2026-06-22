-- ============================================================================
-- MULTI-FUNNEL PORTFOLIO INTELLIGENCE (Sprint 23, tenant). No ws_id.
-- Compare funnels within a business and surface evidence-based, transferable
-- learnings. No BI warehouse, no fabricated rankings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  insight_type        TEXT NOT NULL,   -- strongest_funnel | weakest_funnel | transferable_playbook | underperforming_page | payment_friction | missing_tracking | offer_angle | pending_measurement | insufficient_data
  title               TEXT NOT NULL,
  explanation         TEXT,
  evidence            JSONB DEFAULT '{}',
  confidence          TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  affected_funnels    JSONB DEFAULT '[]',
  recommended_action  TEXT,
  status              TEXT NOT NULL DEFAULT 'open',  -- open | reviewed | applied | ignored
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_insights_biz ON portfolio_insights(business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  measured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics       JSONB DEFAULT '{}',
  insights      JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_biz ON portfolio_snapshots(business_id, measured_at DESC);
