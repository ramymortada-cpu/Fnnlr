-- ============================================================================
-- AI COMMAND EXECUTION LAYER (Sprint 14, tenant). No ws_id.
-- Adds before/after snapshots + the typed action payload so applyCommand can
-- execute the real mutation, with a full audit trail.
-- ============================================================================

ALTER TABLE commands ADD COLUMN IF NOT EXISTS action_kind TEXT;          -- offer_update | section_update | template_update | task_creation | bulk_action | mark_status | create_tracked_link | payment_instruction_update | report_generation | draft_message | leak_repair_plan | navigation | informational
ALTER TABLE commands ADD COLUMN IF NOT EXISTS action_payload JSONB DEFAULT '{}';   -- everything applyCommand needs to execute
ALTER TABLE commands ADD COLUMN IF NOT EXISTS before_snapshot JSONB;
ALTER TABLE commands ADD COLUMN IF NOT EXISTS after_snapshot JSONB;
ALTER TABLE commands ADD COLUMN IF NOT EXISTS result_summary TEXT;
ALTER TABLE commands ADD COLUMN IF NOT EXISTS affected_count INTEGER DEFAULT 0;
ALTER TABLE commands ADD COLUMN IF NOT EXISTS error TEXT;
