# GateForge GA Remediation

Status: IMPLEMENTED_CONTROLS_AND_STAGING_EVIDENCE_REQUIRED

This document tracks the controls added after the GateForge GA audit. It is not
a certification. Production approval still requires staging/live command output
and human attestations where noted.

## Implemented controls

- Route authorization matrix: `modules/security/src/route-matrix.ts`.
- Admin MFA gate: production `owner` and `admin` access to `/admin/*` and
  `/ops/*` requires an MFA-enabled, MFA-verified session.
- AI spend guard: `FNNLR_AI_KILL_SWITCH`, budget-required production behavior,
  tenant/global cap checks, and `ai_usage_events`.
- Webhook replay guard: signed webhook requests reject stale timestamp headers.
- Email readiness: Resend transactional adapter plus explicit env evidence.
- Observability readiness: Sentry/uptime/alert-recipient checks.
- Data lifecycle evidence: sanitized tenant export command and lifecycle event.
- Hosted CI evidence: `.github/workflows/gateforge-ga-evidence.yml`.

## Still requires staging proof

- `npm run ci:live`
- `npm run test:pg`
- `npm run deploy:health-gate`
- `npm run deploy:smoke`
- `npm run deploy:verify-restore`
- `npm run audit:high`
- `npm run sbom:generate`
