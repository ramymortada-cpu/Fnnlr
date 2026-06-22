-- ============================================================================
-- FUNNEL BUILDER — tenant schema additions (applied to every isolated tenant DB)
-- Database-per-tenant: NO ws_id column — the database boundary is the tenant.
-- ============================================================================

-- Funnel stages as real, editable, reorderable records (back the Funnel Map).
CREATE TABLE IF NOT EXISTS funnel_stages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id           UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  position             INTEGER NOT NULL DEFAULT 0,
  name                 TEXT NOT NULL,
  purpose              TEXT,
  channel              TEXT,
  conversion_event     TEXT,
  assets_needed        JSONB DEFAULT '[]',
  expected_leak        TEXT,
  tracking_requirement TEXT,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funnel_stages_journey ON funnel_stages(journey_id, position);

-- Editable page sections (back Landing Page Intelligence).
CREATE TABLE IF NOT EXISTS page_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  type        TEXT NOT NULL,        -- hero|problem|offer|benefits|proof|pricing|faq|guarantee|cta_whatsapp|cta_payment|final_cta
  content     JSONB NOT NULL DEFAULT '{}',
  visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_sections_page ON page_sections(page_id, position);

-- WhatsApp sales flows + message templates (back the WhatsApp Flow Builder).
CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id  UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  tone        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     UUID NOT NULL REFERENCES whatsapp_flows(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,        -- first_reply|qualification|price_reveal|objection|followup_*|payment_reminder|confirmation|delivery|upsell|recovery
  body        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_flow ON whatsapp_message_templates(flow_id, position);

-- Recommendations from leak/optimizer brains (tied to a metric).
CREATE TABLE IF NOT EXISTS recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leak_id       UUID REFERENCES leak_findings(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  metric        TEXT,
  status        TEXT NOT NULL DEFAULT 'open',  -- open|applied|ignored
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead contact + funnel attribution fields (needed by capture + WhatsApp sender).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES journeys(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES journeys(id) ON DELETE SET NULL;

-- Tracked links (back tracked click-to-WhatsApp).
CREATE TABLE IF NOT EXISTS tracked_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  journey_id  UUID REFERENCES journeys(id) ON DELETE CASCADE,
  page_id     UUID REFERENCES pages(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,        -- the wa.me / whatsapp destination
  source      TEXT,                 -- utm/source label
  clicks      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(code);
