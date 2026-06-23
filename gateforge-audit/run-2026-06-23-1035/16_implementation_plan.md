# Implementation Plan

Do not modify code in this rescue-planning step. Phase 1 and Phase 2 work below should be applied only after explicit approval.

| Phase | Fix | Files Likely Affected | Tests Needed | Evidence Produced | Risk | Rollback Plan |
|---|---|---|---|---|---|---|
| Phase 1 | Run live tenant isolation suite | No app code; staging env and audit evidence folder | No new tests; run existing live DB tests | `test:pg`, `ci:live` sanitized logs | Medium | Do not mutate prod; use disposable staging tenants |
| Phase 1 | Run health gate and deployment smoke | No app code; env/secrets config | Existing deploy tests | `deploy:health-gate`, `deploy:smoke` output | Medium | Unset staging env or revert config |
| Phase 1 | Perform backup/restore drill | No app code; backup/restore scripts | Existing restore verifier | backup file metadata, restore-test, verify-restore logs | High | Use disposable restore DB; never restore over prod |
| Phase 1 | Prove admin MFA gate | Control migration already exists; staging user/session | Auth/admin MFA focused tests plus staging API calls | MFA setup/verify and admin reject/allow logs | Medium | Disable MFA for staging user via operator runbook |
| Phase 1 | Prove AI budget controls | Env caps and staging tenant | AI budget focused tests plus staging usage rows | Allowed + kill-switch blocked usage events | Low | Unset caps/kill switch after test |
| Phase 1 | Prove signed webhook replay/idempotency | Staging integration connection/provider secret | Webhook replay/idempotency tests or scripted calls | accepted once, duplicate safe, stale timestamp rejected | Medium | Disable staging connection secret |
| Phase 1 | Attach monitoring and incident evidence | Sentry/uptime/alert config | Alert delivery test | Screenshots/logs and incident drill note | Low | Remove test monitor/alert route |
| Phase 1 | Legal status decision | Legal docs only | Human attestation | FINAL_APPROVED or HUMAN_ATTESTATION_REQUIRED | High | Keep human-attestation if not approved |
| Phase 2 | Verify email deliverability | DNS/provider config | Email readiness test + provider test | SPF/DKIM/DMARC and test email proof | Medium | Use staging sender/domain |
| Phase 2 | Hosted CI/SBOM artifact | GitHub workflow already exists | GitHub run | workflow artifact and audit result | Low | Disable workflow if noisy |
| Phase 2 | Data export/delete proof | Disposable staging tenant | Export/delete lifecycle test | sanitized export hash and delete proof | Medium | Use disposable tenant only |
| Phase 2 | Customer activation telemetry proof | Customer Zero/One staging data | Customer scripts and monitor commands | 72h monitor, first signal, activation summary | Medium | Reset staging customer data |


## Guardrails

- Smallest safe change only.
- No unrelated refactors.
- No cosmetic work in Phase 1.
- Do not expose secrets in logs or artifacts.
- Mark business/legal decisions as `HUMAN_DECISION_REQUIRED`, not PASS.
