-- ============================================================================
-- TRACKED LINKS — UTM + management fields (Sprint 6, tenant schema)
-- Database-per-tenant: no ws_id.
-- ============================================================================

ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS destination_phone TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS message_template TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS medium TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS cta_label TEXT;
ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Lead attribution + touch timestamps (capture polish).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS medium TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attribution JSONB DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_touch_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS link_code TEXT;

-- Conversation capture fields.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source_link_code TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_event_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
