-- ============================================================================
-- PAYMENT FLOW — methods config, proof, state history (Sprint 9, tenant)
-- Database-per-tenant: no ws_id. No real gateway; this models the local-payment
-- JOURNEY (details → proof → review → confirm → deliver) as funnel data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id            UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  method                TEXT NOT NULL,        -- instapay | vodafone_cash | bank_transfer | paymob | fawry | tap | hyperpay | moyasar | stripe | manual_proof | payment_link
  market                TEXT,                 -- eg | sa | ae | gulf | general
  account_details       TEXT,                 -- account/phone/link the customer pays to
  customer_instructions TEXT,
  whatsapp_message      TEXT,
  proof_required        BOOLEAN NOT NULL DEFAULT TRUE,
  review_required       BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_message  TEXT,
  reminder_message      TEXT,
  stuck_followup_message TEXT,
  delivery_message      TEXT,
  reassurance_note      TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  position              INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_journey ON payment_methods(journey_id, position);

-- Proof + review fields on the lead's payment state (placeholder — no real upload yet).
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS proof_required BOOLEAN DEFAULT TRUE;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS proof_received BOOLEAN DEFAULT FALSE;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS proof_reference TEXT;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS proof_note TEXT;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS access_delivered BOOLEAN DEFAULT FALSE;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ DEFAULT now();

-- Payment state history (the payment timeline + leak evidence).
CREATE TABLE IF NOT EXISTS payment_state_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_state  TEXT,
  to_state    TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_state_history_lead ON payment_state_history(lead_id, changed_at);
