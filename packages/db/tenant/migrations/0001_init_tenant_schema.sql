-- ============================================================================
-- TENANT SCHEMA TEMPLATE (applied to EVERY isolated tenant database)
-- ----------------------------------------------------------------------------
-- This schema is created fresh inside each tenant's DEDICATED database.
-- Because each tenant has its own physical database, there is NO ws_id column
-- and NO row-level security needed for cross-tenant safety: the database
-- boundary IS the isolation boundary. A query in tenant A's DB physically
-- cannot see tenant B's data — they are different databases.
--
-- (Within an AGENCY database, multiple client businesses CAN coexist; the
-- `business_id` scoping below handles that intra-agency separation. For
-- agencies on the max-isolation tier, each client gets its own DB instead,
-- and business_id simply has one value.)
-- ============================================================================

-- ---- Businesses / brands (1 for an individual; many under an agency) -------
CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  sector      TEXT,
  market      TEXT,                 -- eg | sa | ae | gulf | general
  dialect     TEXT,                 -- masry | khaleeji | msa | mixed
  currency    TEXT NOT NULL DEFAULT 'EGP',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ---- Journey: a revenue path to market -------------------------------------
CREATE TABLE IF NOT EXISTS journeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  channel       TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_journeys_business ON journeys(business_id);

-- ---- Blueprint records (editable AI outputs) -------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id  UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  content     JSONB NOT NULL,       -- promise, package, price, bonus, guarantee, objections
  version     INTEGER NOT NULL DEFAULT 1,
  score       NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_journey ON offers(journey_id);

CREATE TABLE IF NOT EXISTS pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id  UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  content     JSONB NOT NULL,
  copy_score  NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pages_journey ON pages(journey_id);

-- ---- Leads -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source          TEXT,
  stage           TEXT NOT NULL DEFAULT 'new',
  intent          TEXT,
  trust_level     TEXT,
  risk_score      NUMERIC,
  payment_status  TEXT,
  dialect         TEXT,
  consent         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_leads_business_stage ON leads(business_id, stage);

-- ---- Conversation: TOP-LEVEL object (thread can precede a known lead) -------
CREATE TABLE IF NOT EXISTS conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id               UUID REFERENCES leads(id) ON DELETE SET NULL,  -- NULLABLE on purpose
  first_reply_latency   INTEGER,        -- seconds; powers the Reply-Time leak
  summary               TEXT,
  drop_point            TEXT,
  sentiment             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_latency  ON conversations(business_id, first_reply_latency);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,       -- in | out
  kind            TEXT NOT NULL DEFAULT 'text',  -- text | voice | image
  body            TEXT,
  intent          TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, occurred_at);

-- ---- Page events (from the tracking snippet) -------------------------------
CREATE TABLE IF NOT EXISTS page_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID REFERENCES pages(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,       -- view | scroll | price_reach | cta_click
  visitor     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_events_page ON page_events(page_id, type, occurred_at);

-- ---- Payment state machine -------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  method      TEXT,                -- paymob | fawry | instapay | vodafone_cash | tap | ...
  state       TEXT NOT NULL DEFAULT 'started',
  amount      NUMERIC,
  currency    TEXT NOT NULL DEFAULT 'EGP',
  proof_url   TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_states_lead ON payment_states(lead_id);
CREATE INDEX IF NOT EXISTS idx_payment_states_state ON payment_states(state);

-- ---- Event spine (per-tenant; the diagnosis source of truth) ---------------
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL,
  source       TEXT,
  payload      JSONB,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, occurred_at);

-- ---- Leak findings ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS leak_findings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID REFERENCES journeys(id) ON DELETE CASCADE,
  lane          TEXT NOT NULL,       -- traffic | page | conversation | payment | followup | tracking
  severity      TEXT NOT NULL,
  money_impact  NUMERIC,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  fastest_fix   TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaks_journey ON leak_findings(journey_id);

-- ---- AI outputs (versioned, scoreable) -------------------------------------
CREATE TABLE IF NOT EXISTS ai_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain         TEXT NOT NULL,
  prompt_version TEXT,
  content       JSONB,
  score         NUMERIC,
  cost_usd      NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Audit (per-tenant) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Schema version marker (read by the migration runner) ------------------
CREATE TABLE IF NOT EXISTS schema_migrations_tenant (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
