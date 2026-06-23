# External Attestation Closeout

Status: `ONLY_EXTERNAL_ATTESTATIONS_REMAIN`

Current score estimate: `78-84/100 pending legal/provider attestation`

Current gate decision: `CANNOT_APPROVE`

Requested next decision: `CONDITIONAL_GO_CANDIDATE_PENDING_HUMAN_AND_HOSTED_PROVIDER_ATTESTATION`

## Evidence Already Closed Locally

The repeatable disposable staging command has proven:

- local static verification
- focused Phase 1 control tests
- full local tests
- local CI
- dependency audit
- SBOM generation
- proof/commercial docs checks
- deploy smoke
- live PostgreSQL tenant isolation
- live CI with DB enabled
- health gate wiring
- restore verification logic

Command:

```bash
npm run gateforge:disposable-staging
```

## Remaining External Evidence

| Item | Required Evidence | Owner | Gate Effect |
|---|---|---|---|
| Hosted staging artifact | GitHub Actions or hosted CI artifact running `npm run gateforge:ga-unblock` with real staging secrets | Engineering/operator | Required for `CONDITIONAL_GO` |
| Provider webhook proof | Signed duplicate and stale/replay webhook payload evidence from configured payment/WhatsApp provider test mode | Engineering/operator | Required for webhook P0 closure |
| Monitoring proof | Sentry/equivalent alert, uptime check, cron failure alert, webhook failure alert screenshots/log IDs | Engineering/operator | Required for observability P0 closure |
| Hosted restore drill | Backup, restore into disposable hosted restore DB, `deploy:verify-restore` PASS artifact | Engineering/operator | Required for data recovery P0 closure |
| Legal approval | Terms, Privacy, DPA, subprocessors, retention policy, security contact marked final | Founder/legal | Required for commercial GA |
| Admin MFA runtime proof | Hosted staging owner/admin MFA setup and verify event evidence | Engineering/operator | Required for admin access P0 closure |
| AI budget runtime proof | Hosted staging allowed call, cap-blocked call, kill-switch blocked call, and `ai_usage_events` evidence | Engineering/operator | Required for AI cost P0 closure |

## Exact Hosted Command

Run with real hosted staging environment variables already present:

```bash
GATEFORGE_EVIDENCE_CONTEXT=HOSTED_STAGING npm run gateforge:ga-unblock
```

## Approval Rule

Do not mark full GA `GO` until every external evidence row is archived.

If the hosted staging command passes and legal/provider evidence is attached, the appropriate next decision is:

`CONDITIONAL_GO`
