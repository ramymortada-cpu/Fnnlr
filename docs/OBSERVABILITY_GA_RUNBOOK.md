# Observability GA Runbook

Status: STAGING_EVIDENCE_REQUIRED

Production readiness requires:

- Error alerting via `SENTRY_DSN` or equivalent.
- Uptime monitor against `/health` via `UPTIME_HEALTHCHECK_URL`.
- Alert recipient via `ALERT_EMAIL_TO` or `ALERT_WEBHOOK_URL`.
- Cron failure alert.
- Webhook failure alert.
- Incident owner and escalation path.

Evidence to archive in the GateForge remediation run:

- Screenshot or log of active uptime monitor.
- Screenshot or log of error alert project.
- Test alert delivery confirmation.
- Incident drill note with timestamp.
