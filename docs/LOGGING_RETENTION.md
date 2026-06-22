# fnnlr — Logging & Retention

fnnlr's logging surfaces are the existing tables — no separate observability
platform. None of them store raw secrets or customer-facing stack traces.

## Surfaces
- `audit_events` — security/operational events (commands, repairs, execution,
  launch, issues). **Retain longest.**
- `integration_events` — inbound webhook processing (status + truncated error).
- `scheduled_runs` — job runs (status, summary, error).
- `webhook_deliveries` — outbound deliveries (status, attempts) — no payload secrets.
- command results / execution log / issue log — audit-backed, safe details only.

## Retention policy (recommended)
- Security/audit events: retain 12+ months.
- Integration/scheduled/webhook operational rows: retain 30–90 days, then archive.
- `page_events`: high-volume; archive older rows beyond the analysis window.

## Safe cleanup
- Any cleanup must be time-bounded and tenant-scoped; never deletes audit/security
  events inside the retention window.
- No log line contains a raw credential, connection string, or secret value.
- Customer-facing outputs never include stack traces.
