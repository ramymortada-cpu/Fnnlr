-- ============================================================================
-- ACTION RECOMMENDATION ENGINE (Sprint 28, tenant). No ws_id.
-- Turn attribution + outcome learning into proactive "best next action"
-- recommendations. Explainable, evidence-backed, confidence-aware,
-- approval-gated when they mutate data. No auto-send, no fake confidence.
-- ============================================================================

CREATE TABLE IF NOT EXISTS action_recommendations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id           UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id         UUID REFERENCES businesses(id) ON DELETE CASCADE,
  opportunity_id      UUID REFERENCES revenue_opportunities(id) ON DELETE CASCADE,
  lead_id             UUID REFERENCES leads(id) ON DELETE SET NULL,
  recommendation_type TEXT NOT NULL,   -- create_task | draft_whatsapp_reply | draft_payment_reminder | review_proof | deliver_access | build_repair_plan | apply_playbook | update_page_cta | improve_payment_instructions | mark_needs_followup | open_filtered_view
  dedupe_key          TEXT NOT NULL,
  title               TEXT NOT NULL,
  explanation         TEXT,
  evidence            JSONB DEFAULT '{}',
  confidence          TEXT NOT NULL DEFAULT 'low',   -- low | medium | high
  learning_source     TEXT NOT NULL DEFAULT 'heuristic', -- attribution | opportunity_outcomes | repair_outcomes | playbook_outcomes | heuristic | mixed
  priority_score      INTEGER NOT NULL DEFAULT 0,
  urgency             TEXT NOT NULL DEFAULT 'low',
  expected_effect     TEXT,
  affected_objects    JSONB DEFAULT '[]',
  proposed_action     JSONB DEFAULT '{}',
  requires_approval   BOOLEAN NOT NULL DEFAULT TRUE,    -- false only for non-mutating opens
  status              TEXT NOT NULL DEFAULT 'proposed', -- proposed | accepted | applied | dismissed | expired
  linked_object_type  TEXT,
  linked_object_id    UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at          TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ
);
-- one live recommendation per dedupe_key
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_rec_dedupe_live ON action_recommendations(dedupe_key)
  WHERE status IN ('proposed','accepted');
CREATE INDEX IF NOT EXISTS idx_action_rec_funnel ON action_recommendations(funnel_id, status, priority_score DESC);

CREATE TABLE IF NOT EXISTS recommendation_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id  UUID NOT NULL REFERENCES action_recommendations(id) ON DELETE CASCADE,
  from_status        TEXT,
  to_status          TEXT NOT NULL,
  reason             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_status_history ON recommendation_status_history(recommendation_id, created_at);
