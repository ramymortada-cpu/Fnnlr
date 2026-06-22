-- ============================================================================
-- INTEGRATIONS FOUNDATION (Sprint 15, tenant). No ws_id.
-- Connections store ENCRYPTED credentials only. Webhook events store raw
-- payloads for audit + mapping. Tenant is resolved server-side from the
-- connection id (never trusted from a webhook caller).
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID REFERENCES journeys(id) ON DELETE CASCADE,
  business_id           UUID,
  provider              TEXT NOT NULL,   -- whatsapp_cloud_api | whatsapp_bsp_generic | paymob | fawry | tap | hyperpay | moyasar | meta_pixel | ga4 | outbound_webhook | zapier_make_webhook
  status                TEXT NOT NULL DEFAULT 'not_connected',  -- not_connected | connected | error | disabled
  credentials_encrypted JSONB DEFAULT '{}',   -- each value is an encrypted blob; NEVER returned raw
  settings              JSONB DEFAULT '{}',    -- non-secret config (ids, mappings, urls)
  webhook_secret_enc    TEXT,                  -- encrypted shared secret for inbound verification
  last_health_check_at  TIMESTAMPTZ,
  last_health_status    TEXT,                  -- healthy | warning | error | not_configured
  last_sync_at          TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON integration_connections(provider);

CREATE TABLE IF NOT EXISTS integration_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id      UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  event_type         TEXT,                 -- raw provider event type
  external_id        TEXT,
  raw_payload        JSONB,
  mapped_event_type  TEXT,                 -- fnnlr event it maps to (if understood)
  processed_status   TEXT NOT NULL DEFAULT 'received',  -- received | mapped | applied | unmatched | error
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_events_conn ON integration_events(connection_id, created_at DESC);

-- Control-plane: map a public connection id → tenant, so webhook routes resolve
-- the tenant from the connection id WITHOUT trusting the caller.
-- (Created in the control-plane migration 0004.)
