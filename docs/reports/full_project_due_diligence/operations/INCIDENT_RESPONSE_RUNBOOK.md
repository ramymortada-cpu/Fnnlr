# Incident Response Runbook

Evidence: existing controls include FNNLR_DISABLE_JOBS, rollback plan, support packs, audit events, and health gates.

1. Triage severity.
2. Preserve evidence: logs, audit_events, request IDs, deployment SHA.
3. Contain: disable jobs, pause integrations, revoke sessions if needed.
4. Assess tenant scope.
5. Recover: rollback app version; restore from tested backup only with approval.
6. Communicate status and next update time.
7. Postmortem and add tests.
