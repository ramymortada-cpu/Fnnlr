-- ============================================================================
-- PAGE PUBLISH — tenant schema additions (Sprint 5)
-- Database-per-tenant: no ws_id; the DB boundary is the tenant.
-- ============================================================================

ALTER TABLE pages ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS whatsapp_destination TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug) WHERE slug IS NOT NULL;

-- page_sections already exists (migration 0003) with: page_id, position, type,
-- content JSONB, visible. content holds { title, body, bullets[], ctaLabel, ctaTarget }.
-- Add a metadata column for future use.
ALTER TABLE page_sections ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
