# Rescue Baseline

Source baseline: `gateforge-audit/run-2026-06-23-1035/`. Remediation overlay: `gateforge-audit/run-2026-06-23-1035-remediation/`.

| Category | Current State | Evidence / Source | Notes |
|---|---|---|---|
| Current Gate Decision | `CANNOT_APPROVE` for GA/Production | `10_final_gate_report.md` | Local remediation moved posture to `CONDITIONAL_GO_CANDIDATE`, but GA remains pending staging/live evidence. |
| Current Overall Score | `74/100` | `08_scoring_1_to_100.md` | Score is overridden by open P0 evidence gates. |
| Evidence Confidence | `MEDIUM` | `08_scoring_1_to_100.md`, remediation commands | Code/local tests strong; runtime/provider/legal evidence incomplete. |
| Requested Launch Stage | `GA/Production` | `01_custom_benchmark_profile.md` | Strictest non-enterprise bar. |
| Open P0 Blockers | Live DB isolation, health gate, backup/restore drill, monitoring, legal approval, staging proof for admin MFA/AI caps/webhooks, secret manager/history scan | `05_p0_p1_launch_safety_gate.md`, `gateforge-audit/run-2026-06-23-1035-remediation/02_p0_p1_reassessment.md` | Some controls are now implemented locally but still need staging proof. |
| Open P1 Risks | Email deliverability, hosted SBOM/SCA, export/delete proof, activation telemetry, billing/limits, log retention evidence | `05_p0_p1_launch_safety_gate.md` | These block public beta polish and enterprise confidence more than private beta. |
| Missing Evidence | `ci:live`, `test:pg`, `deploy:health-gate`, real restore drill, Sentry/uptime/alert proof, DNS/email proof, legal attestation, provider webhook proof | `gateforge-audit/run-2026-06-23-1035-remediation/03_staging_execution_checklist.md` | Missing evidence is not PASS. |
| Lowest Scoring Domains | Communications/email 35; SEO/GEO 38; Billing/payments 45; Compliance/legal/privacy 45; UX/UI 58; Enterprise/localization/API/docs 58 | `06_domain_deep_dive_scores.md` | SEO/GEO must not outrank safety blockers. |
| Broken Interdependency Chains | Pricing→billing→limits; tenant isolation→admin→export/delete→logs; AI feature→cost cap→fallback→audit; deployment→monitoring→rollback→incident | `07_interdependency_coherence_check.md` | Rescue phases are organized around these chains. |
| Fastest Path to Next Stage | Private Beta / Conditional Go via staging DB proof, health gate, AI/admin/webhook evidence, monitored rollback/restore, legal marked human-attestation | remediation overlay | GA requires additional legal/provider/monitoring artifacts. |
