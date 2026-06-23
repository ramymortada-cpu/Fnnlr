-- ============================================================================
-- AUTH MFA HARDENING (control-plane)
-- ----------------------------------------------------------------------------
-- Admin/owner-sensitive routes require a session that has recently verified MFA
-- in production. The TOTP secret is encrypted server-side; recovery is an
-- operator runbook, not a self-service bypass.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_note TEXT;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_mfa_verified ON sessions(user_id, mfa_verified_at DESC);
