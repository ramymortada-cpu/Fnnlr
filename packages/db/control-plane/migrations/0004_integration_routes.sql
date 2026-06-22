-- ============================================================================
-- INTEGRATION CONNECTION → TENANT mapping (control-plane, Sprint 15)
-- ----------------------------------------------------------------------------
-- Public webhook routes (/webhooks/whatsapp/:connectionId, /webhooks/payments/
-- :provider/:connectionId) must resolve the tenant from the connection id alone
-- — never from a caller-supplied header. This central map enables that.
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_routes (
  connection_id  UUID PRIMARY KEY,
  provider       TEXT NOT NULL,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_routes_tenant ON integration_routes(tenant_id);
