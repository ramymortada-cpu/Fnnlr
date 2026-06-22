-- ============================================================================
-- REAL-TIME REVENUE OPERATIONS (Sprint 16, tenant). No ws_id.
-- Service window + inbound/outbound on conversations; richer event matching on
-- integration_events; outbound webhook delivery log. No auto-send anywhere.
-- ============================================================================

-- WhatsApp service window + inbound/outbound timing on conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_inbound_at          TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_outbound_at         TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS service_window_opened_at  TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS service_window_expires_at TIMESTAMPTZ;

-- Inbound messages captured from the WhatsApp webhook (no outbound is ever sent)
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,           -- inbound | outbound (outbound only when user marks-sent)
  body            TEXT,
  external_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id, created_at);

-- richer event matching/audit on integration_events
ALTER TABLE integration_events ADD COLUMN IF NOT EXISTS processed_at             TIMESTAMPTZ;
ALTER TABLE integration_events ADD COLUMN IF NOT EXISTS matched_lead_id          UUID;
ALTER TABLE integration_events ADD COLUMN IF NOT EXISTS matched_conversation_id  UUID;
ALTER TABLE integration_events ADD COLUMN IF NOT EXISTS matched_payment_state_id UUID;

-- lead inbound timing
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- leak findings can be marked stale by real-time events (re-diagnose on next view)
ALTER TABLE leak_findings ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT FALSE;

-- outbound webhook delivery log (dispatch v1)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  url             TEXT,
  signature       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_conn ON webhook_deliveries(connection_id, created_at DESC);
