-- ============================================================================
-- PUBLIC CODE → TENANT mapping (control-plane, Sprint 6)
-- ----------------------------------------------------------------------------
-- Public, unauthenticated routes (/r/:code tracked redirect, /p/:slug pages)
-- must resolve the tenant WITHOUT a client-supplied tenant id. This central
-- map lets the redirect look up the tenant from the code alone — no ?t=, no
-- x-tenant-id trust in production.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public_codes (
  code        TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'link' | 'page'
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_codes_tenant ON public_codes(tenant_id);
