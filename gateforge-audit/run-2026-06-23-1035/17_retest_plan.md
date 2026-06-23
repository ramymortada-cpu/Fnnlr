# Re-test Plan

| Fix ID | Re-test Method | Command / Evidence | Expected Result | Updates Which Score | Updates Which Gate | Re-audit Needed? |
|---|---|---|---|---|---|---|
| P0-001 | Run targeted command/evidence collection | `npm run test:pg`, `npm run ci:live`, negative cross-tenant attempts | Evidence archived and status no longer MISSING | Data governance / tenant isolation | CANNOT_APPROVE | Yes for P0/P1 |
| P0-002 | Run targeted command/evidence collection | `npm run deploy:health-gate` returns READY_TO_SERVE or documented DEGRADED | Evidence archived and status no longer MISSING | Architecture / reliability | CANNOT_APPROVE | Yes for P0/P1 |
| P0-003 | Run targeted command/evidence collection | `db:backup`, `db:restore-test`, `db:verify-restore` archived with redacted URLs | Evidence archived and status no longer MISSING | Reliability / data protection | CANNOT_APPROVE | Yes for P0/P1 |
| P0-004 | Run targeted command/evidence collection | rollback rehearsal log plus `deploy:smoke` after rollback plan | Evidence archived and status no longer MISSING | Deployment / operations | CANNOT_APPROVE | Yes for P0/P1 |
| P0-005 | Run targeted command/evidence collection | Sentry/uptime/alert proof, test alert delivery, incident drill note | Evidence archived and status no longer MISSING | Observability / incident response | CANNOT_APPROVE | Yes for P0/P1 |
| P0-006 | Run targeted command/evidence collection | Published Terms, Privacy, DPA, subprocessors, retention statement | Evidence archived and status no longer MISSING | Compliance / legal / privacy | CANNOT_APPROVE | Yes for P0/P1 |
| P0-007 | Run targeted command/evidence collection | Run migration, setup/verify MFA, prove `/admin/*` rejects non-MFA in production | Evidence archived and status no longer MISSING | Admin access / security | CANNOT_APPROVE | Yes for P0/P1 |
| P0-008 | Run targeted command/evidence collection | One allowed AI call and one kill-switch blocked call with `ai_usage_events` evidence | Evidence archived and status no longer MISSING | AI trust / cost control | CANNOT_APPROVE | Yes for P0/P1 |
| P0-009 | Run targeted command/evidence collection | Signed webhook accepted once, duplicate external id idempotent, stale timestamp rejected | Evidence archived and status no longer MISSING | Payments / webhooks | CANNOT_APPROVE | Yes for P0/P1 |
| P0-010 | Run targeted command/evidence collection | Secret manager screenshot/log, git-history scan with redaction, rotation note | Evidence archived and status no longer MISSING | Secrets / security | CANNOT_APPROVE | Yes for P0/P1 |
| P1-001 | Run targeted command/evidence collection | SPF/DKIM/DMARC verified, provider test email, bounce owner | Evidence archived and status no longer MISSING | Communications / email | CONDITIONAL_GO | Yes for P0/P1 |
| P1-002 | Run targeted command/evidence collection | GitHub run with `npm audit --audit-level=high` and SBOM artifact | Evidence archived and status no longer MISSING | Security / enterprise readiness | CONDITIONAL_GO | Yes for P0/P1 |
| P1-003 | Run targeted command/evidence collection | `export-tenant` sanitized evidence and `delete-tenant` proof on disposable tenant | Evidence archived and status no longer MISSING | Data lifecycle / privacy | CONDITIONAL_GO | Yes for P0/P1 |
| P1-004 | Run targeted command/evidence collection | 72h monitor, first-signal, activation summary with no fabricated metrics | Evidence archived and status no longer MISSING | Product / activation | PRIVATE_BETA_ONLY | Yes for P0/P1 |
| P1-005 | Run targeted command/evidence collection | Manual-payment stance documented; if self-serve billing is enabled, add limit tests | Evidence archived and status no longer MISSING | Billing / commercial | CONDITIONAL_GO | Yes for P0/P1 |
| P1-006 | Run targeted command/evidence collection | Sample redacted logs, retention job/process evidence | Evidence archived and status no longer MISSING | Privacy / logging | CONDITIONAL_GO | Yes for P0/P1 |
| P2-001 | Design/product/growth QA evidence | Responsive screenshots and accessibility smoke | Evidence archived; score note updated | UX/UI | NOT_GATE_BLOCKING | Only domain re-score |
| P2-002 | Design/product/growth QA evidence | Portal workflow QA and support deflection evidence | Evidence archived; score note updated | Customer portal / admin | NOT_GATE_BLOCKING | Only domain re-score |
| P2-003 | Design/product/growth QA evidence | robots/sitemap/schema/search snippets; never a No-Go alone | Evidence archived; score note updated | SEO/GEO / growth | GROWTH_READINESS_NOTE | Only domain re-score |
| P2-004 | Design/product/growth QA evidence | Security overview, SLA posture, DPA pack, support response targets | Evidence archived; score note updated | Enterprise readiness | NOT_GATE_BLOCKING | Only domain re-score |
| P3-001 | Design/product/growth QA evidence | Locale matrix and content QA for target markets | Evidence archived; score note updated | Localization / global readiness | NOT_GATE_BLOCKING | Only domain re-score |


Every P0/P1 fix must update the War Board and evidence inventory after execution.
