# SaaS Moat Action Plan

Generated: `2026-07-01T02:35:29.677Z`

This is the execution board for turning fnnlr from a GateForge-blocked release candidate into a global SaaS with a defensible moat. It intentionally separates code-ready work from external hosted evidence so the team does not confuse local progress with GA approval.

## Current Launch Truth

- GateForge state: `CANNOT_APPROVE_LOCAL_EVIDENCE` until hosted staging secrets and attestation are real.
- Current defensible score band: `65-70/100`.
- Next strategic target: `CONDITIONAL_GO` through hosted staging proof.
- Category target: Arabic-first AI Revenue Operations OS, not a generic funnel builder.

## Moat Thesis

fnnlr's moat is the combination of DB-per-tenant trust, Arabic-first revenue workflows, workflow outcome intelligence, repeatable activation, and sales/support proof. The roadmap below prioritizes work that strengthens at least one of those defenses.

## Phase Summary

| Phase | Actions | P0 | P1 | Externally blocked |
| --- | ---: | ---: | ---: | ---: |
| GateForge GA unblock | 24 | 24 | 0 | 16 |
| Trust moat | 12 | 5 | 7 | 0 |
| SaaS packaging moat | 10 | 0 | 10 | 0 |
| Workflow intelligence moat | 8 | 0 | 5 | 0 |
| Activation moat | 8 | 0 | 6 | 0 |
| Distribution moat | 10 | 0 | 8 | 0 |
| Enterprise moat | 8 | 0 | 0 | 0 |
| Operating cadence | 8 | 1 | 5 | 0 |
| Trust center execution | 10 | 0 | 10 | 0 |
| Commercial moat execution | 15 | 0 | 15 | 0 |
| Industry template execution | 15 | 0 | 15 | 0 |
| Activation execution | 8 | 0 | 8 | 0 |
| AI intelligence execution | 8 | 0 | 8 | 0 |
| Sales execution | 6 | 0 | 6 | 0 |
| Enterprise execution | 8 | 0 | 0 | 0 |
| Operating execution | 7 | 0 | 7 | 0 |

## GateForge GA unblock

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GF-001` | `P0` | `BLOCKED_EXTERNAL` | Operator | Provision hosted staging control-plane Postgres. | Trust moat: proves fnnlr can run outside local/dev state. | Provider database URL and successful hosted health gate. |  |
| `GF-002` | `P0` | `BLOCKED_EXTERNAL` | Operator | Provision tenant database admin access for staging. | Isolation moat: DB-per-tenant cannot be claimed without live tenant DB proof. | TENANT_DB_ADMIN_URL validated by live tenant provision/delete test. |  |
| `GF-003` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions. | Trust moat: separates product maturity from local-only evidence. | npm run gateforge:local-secret-files-check and GitHub secrets audit PASS. |  |
| `GF-004` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions. | Isolation moat: proves live tenant database creation and restore paths. | Hosted strict live DB tests PASS. |  |
| `GF-005` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set TENANT_DB_HOST in the local secret pack and GitHub Actions. | Operational moat: makes tenant DB routing inspectable without exposing credentials. | Local secret files check reports READY. |  |
| `GF-006` | `P0` | `BLOCKED_EXTERNAL` | Operator | Create staging Sentry or equivalent error-monitoring project. | Trust moat: enterprise buyers expect runtime failure visibility. | SENTRY_DSN present and alert proof attached. |  |
| `GF-007` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set SENTRY_DSN for staging. | Trust moat: converts observability from document claim to runtime signal. | Hosted strict monitoring item PASS. |  |
| `GF-008` | `P0` | `BLOCKED_EXTERNAL` | Operator | Create uptime monitor for /health. | Reliability moat: public availability proof beats feature demos. | UPTIME_HEALTHCHECK_URL and screenshot/log reference in attestation. |  |
| `GF-009` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set UPTIME_HEALTHCHECK_URL. | Reliability moat: supports repeatable launch gates. | GateForge secret check READY and hosted attestation item PASS. |  |
| `GF-010` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set ALERT_EMAIL_TO for staging operations. | Trust moat: makes incident ownership explicit. | Alert delivery proof in hosted evidence packet. |  |
| `GF-011` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set ALERT_WEBHOOK_URL for staging alerts. | Trust moat: routes operational failures to a real response channel. | Cron/webhook failure alert proof. |  |
| `GF-012` | `P0` | `BLOCKED_EXTERNAL` | Operator | Create Resend staging key or approved transactional email provider key. | Distribution moat: email deliverability is part of activation, not a side quest. | Provider test send and DNS posture evidence. |  |
| `GF-013` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set RESEND_API_KEY. | Activation moat: account and admin alerts must work in staging. | Hosted strict email readiness evidence. |  |
| `GF-014` | `P0` | `BLOCKED_EXTERNAL` | Operator | Verify sender domain and set EMAIL_FROM. | Trust moat: customers should receive branded transactional messages. | SPF/DKIM/DMARC evidence and provider verified sender. |  |
| `GF-015` | `P0` | `BLOCKED_EXTERNAL` | Operator | Set EMAIL_REPLY_TO. | Support moat: every outbound message has a human response path. | Transactional provider config proof. |  |
| `GF-016` | `P0` | `BLOCKED_EXTERNAL` | Operator | Create capped Anthropic staging key. | AI safety moat: AI capability cannot outrun spend controls. | ANTHROPIC_API_KEY present with provider-side cap proof. |  |
| `GF-017` | `P0` | `READY_NOW` | Engineering | Run local secret replacement packet after operator values exist. | Trust moat: no fake values enter launch evidence. | npm run gateforge:secret-replacement-packet PASS. | `npm run gateforge:secret-replacement-packet` |
| `GF-018` | `P0` | `READY_NOW` | Engineering | Generate hosted staging attestation packet from real evidence only. | Evidence moat: GateForge approval becomes reproducible. | hosted-staging-attestation.json validates with external-check. | `npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json` |
| `GF-019` | `P0` | `READY_NOW` | Engineering | Encode validated attestation as the preferred B64 secret. | Trust moat: avoids leaking packet contents while preserving machine validation. | npm run gateforge:attestation-secret-pack -- --write-b64 PASS. | `npm run gateforge:attestation-secret-pack -- --write-b64` |
| `GF-020` | `P0` | `READY_NOW` | Engineering | Run hosted readiness doctor. | Gate moat: one decision file says what to do next. | 44_hosted_readiness_doctor.md says UPLOAD_GITHUB_SECRETS or later. | `npm run gateforge:hosted-readiness-doctor` |
| `GF-021` | `P0` | `READY_NOW` | Engineering | Upload local secret pack to GitHub Actions after validation. | Trust moat: hosted CI becomes the source of launch proof. | GitHub secrets audit READY. | `npm run gateforge:hosted-unblock -- --apply --prepare-attestation` |
| `GF-022` | `P0` | `READY_NOW` | Engineering | Trigger GateForge Hosted Staging Strict. | Evidence moat: moves from local claims to hosted proof. | Hosted strict workflow success URL. |  |
| `GF-023` | `P0` | `READY_NOW` | Engineering | Run final gate and final report. | Gate moat: launch decision follows evidence, not optimism. | final-gate CONDITIONAL_GO or precise blockers. | `npm run gateforge:final-gate && npm run gateforge:final-report` |
| `GF-024` | `P0` | `READY_NOW` | Engineering | Refresh GA unblock status dashboard. | Operating moat: every stakeholder sees one current status. | 47_ga_unblock_status.md/json updated. | `npm run gateforge:ga-unblock-status` |

## Trust moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TR-001` | `P0` | `READY_NOW` | Founder/legal | Mark Terms as FINAL_APPROVED or HUMAN_ATTESTATION_REQUIRED. | Trust moat: paid SaaS needs commercial clarity. | LEGAL_READINESS_STATUS updated with owner and date. |  |
| `TR-002` | `P0` | `READY_NOW` | Founder/legal | Mark Privacy Policy as FINAL_APPROVED or HUMAN_ATTESTATION_REQUIRED. | Trust moat: PII handling must be explicit. | Privacy status and approval reference. |  |
| `TR-003` | `P0` | `READY_NOW` | Founder/legal | Finalize DPA position. | Enterprise moat: procurement requires a data processing answer. | DPA doc or HUMAN_ATTESTATION_REQUIRED row. |  |
| `TR-004` | `P0` | `READY_NOW` | Founder/legal | Publish subprocessor list. | Trust moat: integration and AI vendors become inspectable. | Subprocessor list with provider, purpose, data category. |  |
| `TR-005` | `P0` | `READY_NOW` | Engineering | Publish retention and deletion policy. | Trust moat: customers know data lifecycle guarantees. | DATA_LIFECYCLE references export/delete commands. |  |
| `TR-006` | `P1` | `READY_NOW` | Engineering | Add security contact and vulnerability disclosure path. | Trust moat: serious buyers need responsible disclosure. | SECURITY_TRUST_PROOF updated. |  |
| `TR-007` | `P1` | `READY_NOW` | Engineering | Create trust center index linking security, privacy, DPA, retention, backup, incident response. | Trust moat: reduces sales friction with one proof packet. | docs/TRUST_CENTER_INDEX.md. |  |
| `TR-008` | `P1` | `READY_NOW` | Engineering | Create public-safe backup and restore posture. | Reliability moat: proof of recoverability beats uptime claims. | BACKUP_RESTORE_RUNBOOK linked to hosted restore evidence. |  |
| `TR-009` | `P1` | `NEXT` | Engineering | Add audit log viewer backlog with acceptance criteria. | Trust moat: enterprise admins buy control and traceability. | Issue/backlog item with API, UI, export acceptance. |  |
| `TR-010` | `P1` | `NEXT` | Engineering | Add data export UI readiness contract with acceptance criteria. | Trust moat: data portability reduces buyer risk. | Backlog item and readiness tests linked to export-tenant command. |  |
| `TR-011` | `P1` | `NEXT` | Engineering | Add deletion request workflow readiness contract. | Trust moat: legal readiness becomes an operator workflow. | Backlog item and readiness tests linked to delete-tenant proof. |  |
| `TR-012` | `P1` | `NEXT` | Engineering | Create incident response exercise readiness contract. | Trust moat: incident readiness becomes repeatable. | Incident drill template, readiness tests, owner, and hosted proof gap. |  |

## SaaS packaging moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PK-001` | `P1` | `READY_NOW` | Product | Freeze positioning as Arabic-first AI Revenue Operations OS. | Category moat: avoids being boxed as a generic funnel builder. | COMPETITIVE_POSITIONING updated with category statement. |  |
| `PK-002` | `P1` | `READY_NOW` | Product | Define Starter plan limits. | Business moat: plan limits protect margin and simplify sales. | Pricing/limits matrix. |  |
| `PK-003` | `P1` | `READY_NOW` | Product | Define Growth plan limits. | Business moat: expansion path is explicit. | Pricing/limits matrix. |  |
| `PK-004` | `P1` | `READY_NOW` | Product | Define Scale plan limits. | Business moat: larger customers have a reason to upgrade. | Pricing/limits matrix. |  |
| `PK-005` | `P1` | `READY_NOW` | Product | Define Enterprise custom limits and proof requirements. | Enterprise moat: procurement path is separated from self-serve. | Enterprise row in pricing/limits matrix. |  |
| `PK-006` | `P1` | `NEXT` | Engineering | Map pricing limits to enforcement readiness contract. | Margin moat: plans are real only when enforced. | Limit-to-code map plus readiness tests for seats, workflows, AI spend, contacts, integrations. |  |
| `PK-007` | `P1` | `NEXT` | Engineering | Add usage-limit acceptance readiness gate. | Margin moat: accidental overuse is caught before launch. | Commercial limit tests plus route-level proof gap tracking. |  |
| `PK-008` | `P1` | `READY_NOW` | Sales | Create one-page sales proof pack. | Distribution moat: sales can repeat without founder improvisation. | CUSTOMER_PROOF_PACK linked from sales docs. |  |
| `PK-009` | `P1` | `READY_NOW` | Sales | Create ROI calculator assumptions. | Distribution moat: buyers see payback, not feature count. | ROI assumptions in COMMERCIAL_PACKAGING. |  |
| `PK-010` | `P1` | `READY_NOW` | Support | Map support SLA tiers to plans. | Trust moat: support promise matches revenue model. | SUPPORT_WORKFLOW and commercial packaging updated. |  |

## Workflow intelligence moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `WI-001` | `P1` | `NEXT` | Engineering | Link ai_usage_events to workflow id where available. | Data moat: AI spend becomes workflow intelligence. | Schema/API design note and tests. |  |
| `WI-002` | `P1` | `NEXT` | Engineering | Link ai_usage_events to business outcome where available. | Data moat: recommendations improve from outcomes, not prompts alone. | Outcome linkage test/backlog. |  |
| `WI-003` | `P1` | `NEXT` | Engineering | Compute cost per successful workflow action. | Margin moat: fnnlr can optimize AI cost by outcome. | Metric definition and dashboard backlog. |  |
| `WI-004` | `P1` | `NEXT` | Product | Define next-best-action v1 rules. | Workflow moat: recommendations become productized operating guidance. | Rules document with evidence inputs. |  |
| `WI-005` | `P1` | `NEXT` | Product | Define follow-up quality score. | Arabic-first moat: sales language can be scored by local norms. | Scoring rubric in docs. |  |
| `WI-006` | `P2` | `NEXT` | Product | Create lead qualification confidence rubric. | Workflow moat: CRM work becomes guided and measurable. | Rubric and test fixtures. |  |
| `WI-007` | `P2` | `NEXT` | Engineering | Add AI cost dashboard readiness and cap forecast evidence. | Margin moat: operators can see and cap AI spend. | Dashboard readiness review plus cap forecast tests. |  |
| `WI-008` | `P2` | `NEXT` | Engineering | Add tenant AI cap change forecast contract before UI implementation. | Trust moat: customers get predictable AI behavior. | Cap change forecast, approval evidence, and remaining UI gap. |  |

## Activation moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AC-001` | `P1` | `READY_NOW` | Product | Define onboarding wizard steps. | Activation moat: time-to-first-value becomes engineered. | ONBOARDING_PROMISE updated with steps. |  |
| `AC-002` | `P1` | `NEXT` | Engineering | Add industry selection readiness contract and event evidence. | Distribution moat: each segment gets a tailored path. | Readiness module, metrics evidence, and hosted proof gap. |  |
| `AC-003` | `P1` | `NEXT` | Engineering | Add goal selection readiness contract and event evidence. | Activation moat: workflows map to customer outcomes. | Readiness module, metrics evidence, and goal mapping gap. |  |
| `AC-004` | `P1` | `NEXT` | Product | Define time-to-first-workflow metric. | Activation moat: onboarding quality becomes measurable. | Metric definition with event names. |  |
| `AC-005` | `P1` | `NEXT` | Product | Define time-to-first-lead-action metric. | Revenue moat: activation is tied to customer work, not login. | Metric definition with event names. |  |
| `AC-006` | `P1` | `NEXT` | Engineering | Aggregate onboarding abandonment reasons into cohort review actions. | Activation moat: every failed setup trains the system. | Cohort review exposes top abandonment step/reason with owner action. |  |
| `AC-007` | `P2` | `NEXT` | Product | Create onboarding recovery email sequence. | Distribution moat: reduces trial drop-off. | Email copy and trigger conditions. |  |
| `AC-008` | `P2` | `NEXT` | Support | Create admin onboarding checklist. | Support moat: handoff becomes repeatable. | Checklist linked to SALES_TO_ACTIVATION_HANDOFF. |  |

## Distribution moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DT-001` | `P1` | `READY_NOW` | Product | Select first ICP for launch wedge. | Distribution moat: focus beats broad generic positioning. | ICP chosen in SAAS_MOAT_ACTION_PLAN. |  |
| `DT-002` | `P1` | `READY_NOW` | Marketing | Create real-estate template brief. | MENA moat: high-fit Arabic follow-up workflows. | Industry template brief with funnel, WhatsApp, qualification, handoff. |  |
| `DT-003` | `P1` | `READY_NOW` | Marketing | Create clinic template brief. | MENA moat: appointment and follow-up workflows localize well. | Industry template brief. |  |
| `DT-004` | `P1` | `READY_NOW` | Marketing | Create education template brief. | MENA moat: admissions follow-up is repeatable. | Industry template brief. |  |
| `DT-005` | `P1` | `READY_NOW` | Marketing | Create agency template brief. | Distribution moat: agencies can resell repeatable workflows. | Industry template brief. |  |
| `DT-006` | `P1` | `READY_NOW` | Marketing | Create ecommerce template brief. | Distribution moat: abandoned lead/order workflows are measurable. | Industry template brief. |  |
| `DT-007` | `P1` | `NEXT` | Sales | Create founder-led demo script. | Distribution moat: demos become consistent and measurable. | PILOT_DEMO updated. |  |
| `DT-008` | `P1` | `NEXT` | Sales | Create objection handling library. | Distribution moat: Arabic buyer objections become reusable data. | INTERNAL_SALES_SCRIPT updated. |  |
| `DT-009` | `P2` | `NEXT` | Sales | Create partner agency program brief. | Channel moat: agencies multiply distribution. | Partner brief and qualification criteria. |  |
| `DT-010` | `P2` | `NEXT` | Marketing | Create first case-study template. | Proof moat: customer evidence becomes repeatable. | CUSTOMER_PROOF_PACK updated. |  |

## Enterprise moat

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EN-001` | `P2` | `NEXT` | Engineering | Create RBAC expansion readiness contract. | Enterprise moat: admins need granular control. | Role matrix, governance readiness tests, and route policy gaps. |  |
| `EN-002` | `P2` | `NEXT` | Engineering | Create workspace policy readiness contract. | Enterprise moat: workspace governance supports larger accounts. | Policy acceptance criteria, governance readiness tests, and admin UI gap. |  |
| `EN-003` | `P2` | `NEXT` | Engineering | Create audit export backlog. | Trust moat: enterprise security teams need exportable logs. | Export format and permissions spec. |  |
| `EN-004` | `P2` | `LATER` | Engineering | Create SSO/OIDC readiness plan. | Enterprise moat: procurement path for larger buyers. | SSO readiness doc. |  |
| `EN-005` | `P2` | `LATER` | Engineering | Create SAML backlog. | Enterprise moat: supports traditional enterprise identity. | SAML acceptance criteria. |  |
| `EN-006` | `P2` | `READY_NOW` | Product | Define data residency position. | Enterprise moat: MENA/global readiness needs a clear answer. | Security/trust docs updated. |  |
| `EN-007` | `P2` | `READY_NOW` | Sales | Create procurement checklist. | Enterprise moat: sales can answer security reviews faster. | Enterprise procurement packet. |  |
| `EN-008` | `P3` | `LATER` | Engineering | Create SOC2 readiness roadmap. | Trust moat: long-term enterprise credibility. | SOC2 roadmap with controls and evidence owners. |  |

## Operating cadence

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `OP-001` | `P0` | `READY_NOW` | Engineering | Run GateForge status after every evidence-changing change. | Operating moat: the launch gate stays current. | 47_ga_unblock_status updated. | `npm run gateforge:ga-unblock-status` |
| `OP-002` | `P1` | `READY_NOW` | Engineering | Run moat action plan check in CI. | Execution moat: roadmap quality is enforced. | npm run moat:check PASS. | `npm run moat:check` |
| `OP-003` | `P1` | `READY_NOW` | Leadership | Review P0/P1 moat board weekly. | Operating moat: leadership attention follows blockers, not noise. | Meeting note with changed statuses. |  |
| `OP-004` | `P1` | `NEXT` | Support | Create customer health score definition. | Retention moat: support sees risk early. | Health score doc and event inputs. |  |
| `OP-005` | `P1` | `NEXT` | Support | Create support triage board categories. | Support moat: support issues become product intelligence. | SUPPORT_WORKFLOW updated. |  |
| `OP-006` | `P1` | `NEXT` | Product | Create activation cohort review template. | Activation moat: cohorts reveal what is repeatable. | Template linked from operating docs. |  |
| `OP-007` | `P2` | `NEXT` | Finance/ops | Create monthly AI spend review. | Margin moat: AI cost is managed like COGS. | Monthly report template. |  |
| `OP-008` | `P2` | `NEXT` | Product | Create template performance review. | Workflow moat: templates improve from observed outcomes. | Review template and metrics. |  |

## Trust center execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-001` | `P1` | `READY_NOW` | Engineering | Create trust center landing index with security, legal, data lifecycle, support, and incident links. | Trust moat: proof becomes self-serve for buyers. | docs/TRUST_CENTER_INDEX.md exists and links proof docs. |  |
| `EX-002` | `P1` | `READY_NOW` | Engineering | Add security overview summary for sales use. | Trust moat: security answers stop being improvised. | Security overview section linked from trust center. |  |
| `EX-003` | `P1` | `READY_NOW` | Founder/legal | Add legal approval tracker row for Terms. | Trust moat: legal status is explicit, not assumed. | Legal tracker shows owner, state, and evidence. |  |
| `EX-004` | `P1` | `READY_NOW` | Founder/legal | Add legal approval tracker row for Privacy. | Trust moat: privacy status is inspectable. | Legal tracker shows owner, state, and evidence. |  |
| `EX-005` | `P1` | `READY_NOW` | Founder/legal | Add legal approval tracker row for DPA. | Enterprise moat: DPA readiness is visible early. | Legal tracker shows owner, state, and evidence. |  |
| `EX-006` | `P1` | `READY_NOW` | Founder/legal | Add legal approval tracker row for subprocessors. | Trust moat: vendors and data purposes are visible. | Subprocessor row exists with evidence owner. |  |
| `EX-007` | `P1` | `READY_NOW` | Engineering | Add retention and deletion summary to trust center. | Trust moat: customer data promises are easy to verify. | Trust center links DATA_LIFECYCLE. |  |
| `EX-008` | `P1` | `READY_NOW` | Engineering | Add backup and restore summary to trust center. | Reliability moat: recoverability becomes part of sales proof. | Trust center links BACKUP_RESTORE_RUNBOOK. |  |
| `EX-009` | `P1` | `READY_NOW` | Engineering | Add incident response summary to trust center. | Trust moat: buyers can see escalation posture. | Trust center links incident/observability docs. |  |
| `EX-010` | `P1` | `READY_NOW` | Support | Add support workflow summary to trust center. | Support moat: operations maturity becomes visible. | Trust center links SUPPORT_WORKFLOW. |  |

## Commercial moat execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-011` | `P1` | `READY_NOW` | Product | Create pricing and limits matrix document. | Business moat: packaging becomes enforceable and sellable. | docs/PRICING_AND_LIMITS_MATRIX.md. |  |
| `EX-012` | `P1` | `READY_NOW` | Product | Define Starter seats limit. | Margin moat: support and usage exposure are controlled. | Starter plan row has seats limit. |  |
| `EX-013` | `P1` | `READY_NOW` | Product | Define Starter workflows limit. | Margin moat: workflow volume maps to plan value. | Starter plan row has workflow limit. |  |
| `EX-014` | `P1` | `READY_NOW` | Product | Define Starter contacts limit. | Margin moat: database/storage cost is bounded. | Starter plan row has contacts limit. |  |
| `EX-015` | `P1` | `READY_NOW` | Product | Define Starter AI budget limit. | AI moat: value is delivered without uncontrolled COGS. | Starter plan row has AI cap. |  |
| `EX-016` | `P1` | `READY_NOW` | Product | Define Growth seats limit. | Business moat: upgrade path is clear. | Growth plan row has seats limit. |  |
| `EX-017` | `P1` | `READY_NOW` | Product | Define Growth workflows limit. | Business moat: growing usage expands revenue. | Growth plan row has workflow limit. |  |
| `EX-018` | `P1` | `READY_NOW` | Product | Define Growth contacts limit. | Business moat: customer scale maps to price. | Growth plan row has contacts limit. |  |
| `EX-019` | `P1` | `READY_NOW` | Product | Define Growth AI budget limit. | AI moat: higher value plans get higher controlled capacity. | Growth plan row has AI cap. |  |
| `EX-020` | `P1` | `READY_NOW` | Product | Define Scale seats limit. | Enterprise moat: larger teams have a packaged path before custom. | Scale plan row has seats limit. |  |
| `EX-021` | `P1` | `READY_NOW` | Product | Define Scale workflows limit. | Business moat: workflow scale becomes paid expansion. | Scale plan row has workflow limit. |  |
| `EX-022` | `P1` | `READY_NOW` | Product | Define Scale contacts limit. | Business moat: large databases are monetized. | Scale plan row has contacts limit. |  |
| `EX-023` | `P1` | `READY_NOW` | Product | Define Scale AI budget limit. | AI moat: scale value stays margin-aware. | Scale plan row has AI cap. |  |
| `EX-024` | `P1` | `READY_NOW` | Sales | Define Enterprise proof requirements. | Enterprise moat: custom buyers get a trust-led process. | Enterprise row lists security, legal, SLA, and procurement proof. |  |
| `EX-025` | `P1` | `READY_NOW` | Sales | Define paid onboarding package. | Distribution moat: activation services become repeatable revenue. | Pricing matrix includes onboarding package. |  |

## Industry template execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-026` | `P1` | `READY_NOW` | Product | Create real-estate template brief. | Arabic-first moat: local property follow-up becomes a product asset. | docs/industry-templates/real-estate.md. |  |
| `EX-027` | `P1` | `READY_NOW` | Product | Create real-estate WhatsApp sequence. | Workflow moat: segment-specific follow-up is reusable. | Template includes WhatsApp sequence. |  |
| `EX-028` | `P1` | `READY_NOW` | Product | Create real-estate qualification rules. | Workflow moat: lead triage becomes local and repeatable. | Template includes qualification rules. |  |
| `EX-029` | `P1` | `READY_NOW` | Product | Create clinic template brief. | Arabic-first moat: appointment workflows localize strongly. | docs/industry-templates/clinics.md. |  |
| `EX-030` | `P1` | `READY_NOW` | Product | Create clinic WhatsApp sequence. | Workflow moat: appointment reminders become repeatable. | Template includes WhatsApp sequence. |  |
| `EX-031` | `P1` | `READY_NOW` | Product | Create clinic qualification rules. | Workflow moat: inquiry quality becomes measurable. | Template includes qualification rules. |  |
| `EX-032` | `P1` | `READY_NOW` | Product | Create education template brief. | Arabic-first moat: admissions workflows become a reusable wedge. | docs/industry-templates/education.md. |  |
| `EX-033` | `P1` | `READY_NOW` | Product | Create education WhatsApp sequence. | Workflow moat: admissions follow-up becomes structured. | Template includes WhatsApp sequence. |  |
| `EX-034` | `P1` | `READY_NOW` | Product | Create education qualification rules. | Workflow moat: student intent becomes measurable. | Template includes qualification rules. |  |
| `EX-035` | `P1` | `READY_NOW` | Product | Create agency template brief. | Distribution moat: agencies can resell standardized workflows. | docs/industry-templates/agencies.md. |  |
| `EX-036` | `P1` | `READY_NOW` | Product | Create agency WhatsApp sequence. | Distribution moat: agency follow-up becomes productized. | Template includes WhatsApp sequence. |  |
| `EX-037` | `P1` | `READY_NOW` | Product | Create agency qualification rules. | Distribution moat: agency pipeline hygiene becomes repeatable. | Template includes qualification rules. |  |
| `EX-038` | `P1` | `READY_NOW` | Product | Create ecommerce template brief. | Workflow moat: abandoned cart/order workflows become repeatable. | docs/industry-templates/ecommerce.md. |  |
| `EX-039` | `P1` | `READY_NOW` | Product | Create ecommerce WhatsApp sequence. | Workflow moat: commerce follow-up can be tuned by outcome. | Template includes WhatsApp sequence. |  |
| `EX-040` | `P1` | `READY_NOW` | Product | Create ecommerce qualification rules. | Workflow moat: buyer intent is scored consistently. | Template includes qualification rules. |  |

## Activation execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-041` | `P1` | `READY_NOW` | Product | Create activation metrics spec. | Activation moat: onboarding quality becomes measurable. | docs/ACTIVATION_METRICS_SPEC.md. |  |
| `EX-042` | `P1` | `READY_NOW` | Product | Define time_to_first_workflow event. | Activation moat: first value has a measurable timestamp. | Metric spec includes event definition. |  |
| `EX-043` | `P1` | `READY_NOW` | Product | Define time_to_first_lead_action event. | Revenue moat: activation ties to real customer work. | Metric spec includes event definition. |  |
| `EX-044` | `P1` | `READY_NOW` | Product | Define onboarding_abandoned event. | Activation moat: failures create learning data. | Metric spec includes event definition. |  |
| `EX-045` | `P1` | `READY_NOW` | Product | Define template_selected event. | Workflow moat: template adoption becomes measurable. | Metric spec includes event definition. |  |
| `EX-046` | `P1` | `READY_NOW` | Product | Define first_publish event. | Activation moat: launch readiness becomes measurable. | Metric spec includes event definition. |  |
| `EX-047` | `P1` | `READY_NOW` | Support | Create admin onboarding checklist. | Support moat: onboarding becomes repeatable between customers. | docs/ADMIN_ONBOARDING_CHECKLIST.md. |  |
| `EX-048` | `P1` | `READY_NOW` | Support | Create onboarding failure recovery checklist. | Activation moat: failed setup has a recovery path. | Checklist includes owners and triggers. |  |

## AI intelligence execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-049` | `P1` | `READY_NOW` | Product | Create workflow intelligence spec. | Data moat: AI usage is converted into product learning. | docs/WORKFLOW_INTELLIGENCE_SPEC.md. |  |
| `EX-050` | `P1` | `READY_NOW` | Product | Define cost_per_workflow metric. | Margin moat: AI spend is evaluated by outcome. | Workflow intelligence spec includes metric formula. |  |
| `EX-051` | `P1` | `READY_NOW` | Product | Define cost_per_successful_action metric. | Margin moat: recommendations can optimize cost and impact. | Workflow intelligence spec includes metric formula. |  |
| `EX-052` | `P1` | `READY_NOW` | Product | Define degraded_fallback_rate metric. | Trust moat: AI degradation is visible and auditable. | Workflow intelligence spec includes metric formula. |  |
| `EX-053` | `P1` | `READY_NOW` | Product | Define next_best_action v1 rules. | Workflow moat: recommendations become structured operating advice. | Workflow intelligence spec includes rule table. |  |
| `EX-054` | `P1` | `READY_NOW` | Product | Define follow_up_quality_score rubric. | Arabic-first moat: sales language can be scored locally. | Workflow intelligence spec includes rubric. |  |
| `EX-055` | `P1` | `READY_NOW` | Product | Define lead_qualification_confidence rubric. | Workflow moat: qualification becomes consistent. | Workflow intelligence spec includes rubric. |  |
| `EX-056` | `P1` | `READY_NOW` | Engineering | Create implementation backlog for workflow id on AI usage events. | Data moat: model usage links to business workflows. | Spec includes engineering backlog row. |  |

## Sales execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-057` | `P1` | `READY_NOW` | Sales | Create founder-led SaaS demo script. | Distribution moat: demos become repeatable. | docs/FOUNDER_LED_DEMO_SCRIPT.md. |  |
| `EX-058` | `P1` | `READY_NOW` | Sales | Create Arabic objection handling library. | Distribution moat: local buyer objections become reusable playbooks. | docs/OBJECTION_HANDLING_LIBRARY.md. |  |
| `EX-059` | `P1` | `READY_NOW` | Sales | Create pilot offer brief. | Distribution moat: first customers get a repeatable entry offer. | Pilot offer section in sales docs. |  |
| `EX-060` | `P1` | `READY_NOW` | Sales | Create partner agency brief. | Channel moat: agencies can multiply distribution. | docs/PARTNER_AGENCY_PROGRAM.md. |  |
| `EX-061` | `P1` | `READY_NOW` | Marketing | Create first case-study template. | Proof moat: customer evidence becomes structured. | docs/CASE_STUDY_TEMPLATE.md. |  |
| `EX-062` | `P1` | `READY_NOW` | Marketing | Create outreach sequence for first ICP. | Distribution moat: GTM becomes testable. | docs/ICP_OUTREACH_SEQUENCE.md. |  |

## Enterprise execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-063` | `P2` | `READY_NOW` | Engineering | Create enterprise readiness backlog. | Enterprise moat: long-term procurement work is mapped. | docs/ENTERPRISE_READINESS_BACKLOG.md. |  |
| `EX-064` | `P2` | `READY_NOW` | Engineering | Define RBAC expansion requirements. | Enterprise moat: authorization scales beyond simple roles. | Enterprise backlog includes RBAC row. |  |
| `EX-065` | `P2` | `READY_NOW` | Engineering | Define workspace policy requirements. | Enterprise moat: customer admins gain governance. | Enterprise backlog includes workspace policy row. |  |
| `EX-066` | `P2` | `READY_NOW` | Engineering | Define audit export requirements. | Trust moat: enterprise customers can review activity. | Enterprise backlog includes audit export row. |  |
| `EX-067` | `P2` | `READY_NOW` | Engineering | Define SSO/OIDC requirements. | Enterprise moat: identity readiness is planned. | Enterprise backlog includes SSO row. |  |
| `EX-068` | `P2` | `READY_NOW` | Engineering | Define data residency position. | Enterprise moat: global SaaS buyers get a clear answer. | Enterprise backlog includes data residency row. |  |
| `EX-069` | `P2` | `READY_NOW` | Sales | Create procurement checklist. | Enterprise moat: sales can handle security reviews faster. | docs/PROCUREMENT_CHECKLIST.md. |  |
| `EX-070` | `P2` | `READY_NOW` | Engineering | Create SOC2 readiness outline. | Trust moat: long-term compliance path is visible. | docs/SOC2_READINESS_OUTLINE.md. |  |

## Operating execution

| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EX-071` | `P1` | `READY_NOW` | Leadership | Create weekly moat review template. | Operating moat: execution is reviewed by blockers and evidence. | docs/WEEKLY_MOAT_REVIEW_TEMPLATE.md. |  |
| `EX-072` | `P1` | `READY_NOW` | Support | Create customer health score spec. | Retention moat: risk signals become operational. | docs/CUSTOMER_HEALTH_SCORE_SPEC.md. |  |
| `EX-073` | `P1` | `READY_NOW` | Support | Create support triage board taxonomy. | Support moat: support issues become product signals. | docs/SUPPORT_TRIAGE_TAXONOMY.md. |  |
| `EX-074` | `P1` | `READY_NOW` | Product | Create activation cohort review template. | Activation moat: repeatability is measured weekly. | docs/ACTIVATION_COHORT_REVIEW.md. |  |
| `EX-075` | `P1` | `READY_NOW` | Finance/ops | Create AI spend review template. | Margin moat: AI COGS are managed continuously. | docs/AI_SPEND_REVIEW_TEMPLATE.md. |  |
| `EX-076` | `P1` | `READY_NOW` | Product | Create template performance review template. | Workflow moat: templates improve from outcomes. | docs/TEMPLATE_PERFORMANCE_REVIEW.md. |  |
| `EX-077` | `P1` | `READY_NOW` | Engineering | Link the 165-point moat board from the evidence index. | Operating moat: the roadmap is discoverable from the proof system. | docs/EVIDENCE_INDEX.md links SAAS_MOAT_ACTION_PLAN. |  |
