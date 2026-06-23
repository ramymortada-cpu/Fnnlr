# Fastest Path To Next Launch Stage

| Target Stage | Required Fixes | Required Evidence | Acceptable Risks | Still Not Required | Estimated Path |
|---|---|---|---|---|---|
| Private Beta | Run staging DB suite, health smoke, admin MFA proof, AI cap proof, basic monitoring, legal marked human-attestation | `test:pg`, `ci:live`, `deploy:smoke`, MFA/AI evidence, support owner | SEO/GEO weak, limited self-service billing, manual legal attestation if disclosed | Enterprise procurement, full SEO/GEO, global localization | 1-3 days with staging env |
| Public Beta | Phase 1 plus email deliverability, hosted CI/SBOM, export/delete proof, alerting and incident drill | DNS/email proof, GitHub artifact, export/delete logs, alert test | Advanced enterprise features and deep UX polish can remain queued | Trust center, SLA procurement, global scale docs | 1-2 weeks |
| GA | Phase 1/2 plus final legal publication, restore drill, rollback rehearsal, provider webhook proof, uptime/SLO evidence | Published legal pack, restore/rollback logs, provider webhook replay/idempotency, uptime monitor | SEO/GEO can remain improvement note; enterprise custom procurement can remain queued | Enterprise SSO, full trust center automation | 2-4 weeks |
| Enterprise Readiness | GA plus procurement/security pack, DPA/SLA, admin governance evidence, support SLA, localization/API docs | Trust center, DPA/SLA, security overview, support metrics, API/admin docs | Some market-specific localization outside chosen countries | Nothing critical for target enterprise segment | 4-8 weeks |
