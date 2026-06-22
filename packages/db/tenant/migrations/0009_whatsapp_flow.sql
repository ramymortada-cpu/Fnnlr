-- ============================================================================
-- WHATSAPP SALES FLOW — step metadata + copilot drafts (Sprint 10, tenant)
-- Database-per-tenant: no ws_id. No real sending; this stores flows + drafts.
-- ============================================================================

-- Extend the existing whatsapp_message_templates (from 0003) into rich steps.
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS step_type TEXT;       -- first_reply|qualification|need_discovery|price_reveal|objection|payment_details|payment_reminder|proof_reminder|confirmation|delivery|no_response|recovery|upsell
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS trigger_stage TEXT;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS trigger_payment_state TEXT;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS objection_key TEXT;    -- for objection templates
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS delay_suggestion TEXT; -- e.g. "بعد ساعة", "اليوم التالي"
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS paid_template_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS no_zann_cooldown_hours INTEGER DEFAULT 24;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS when_to_use TEXT;
ALTER TABLE whatsapp_message_templates ADD COLUMN IF NOT EXISTS followup_suggestion TEXT;

ALTER TABLE whatsapp_flows ADD COLUMN IF NOT EXISTS strategy TEXT;
ALTER TABLE whatsapp_flows ADD COLUMN IF NOT EXISTS handoff_notes TEXT;

-- Drafted/sent copilot replies (human-in-the-loop; "sent" is a manual mark only).
CREATE TABLE IF NOT EXISTS whatsapp_draft_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES whatsapp_message_templates(id) ON DELETE SET NULL,
  step_type     TEXT,
  body          TEXT NOT NULL,
  marked_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_drafts_lead ON whatsapp_draft_replies(lead_id, created_at);

-- last contacted timestamp for cooldown / no-zann reasoning.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
