# Staging Execution Checklist

Run these with real staging env and archive sanitized output into this run folder:

1. `npm run ci:live`
2. `npm run test:pg`
3. `npm run deploy:health-gate`
4. `npm run deploy:smoke`
5. `npm run db:backup -- <STAGING_CONTROL_DB_URL> <redacted-output-path>`
6. `npm run db:verify-restore -- <STAGING_CONTROL_DB_URL> control`
7. `npm run db:verify-restore -- <STAGING_TENANT_DB_URL> tenant`
8. `npm run export-tenant -- --id=<stagingTenantId> --out=gateforge-audit/run-2026-06-23-1035-remediation/evidence`
9. Trigger one admin MFA setup + verify on staging.
10. Trigger one AI call with budget caps configured and one with kill switch enabled.
11. Send one signed payment webhook twice with the same external id and once with a stale timestamp.
12. Verify Resend test email and DNS records.
13. Attach Sentry/uptime/alert proof.
14. Attach legal approval attestation or keep `HUMAN_ATTESTATION_REQUIRED`.

Expected next GateForge decision after successful staging evidence: `CONDITIONAL_GO`; `GO` requires legal attestation plus external provider/monitoring artifacts.
