-- ============================================================================
-- LEAK FINDINGS — detail fields for the Leak Board (Sprint 8, tenant)
-- Database-per-tenant: no ws_id.
-- ============================================================================

ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}';
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS confidence TEXT DEFAULT 'medium';
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS recommended_action TEXT;
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS code TEXT;        -- stable detector code (for upsert/dedup)
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leak_findings_journey ON leak_findings(journey_id, lane);
