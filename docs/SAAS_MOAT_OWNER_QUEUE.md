# SaaS Moat Owner Execution Queue

Generated: `2026-07-01T13:26:12.647Z`

This queue is derived from `SAAS_MOAT_EXECUTION_STATUS.json` and includes only actions in `OWNER_OR_DOC_ACTION_READY`. It is intentionally separate from P0 hosted blockers: external/runtime proof still gates GA, while this queue gives Product, Sales, Support, Legal, Marketing, Leadership, and Finance the next non-code actions that strengthen the global SaaS moat.

## Summary By Owner

| Owner | Actions |
| --- | ---: |
| Engineering | 10 |
| Founder/legal | 4 |
| Marketing | 1 |
| Product | 33 |
| Sales | 3 |
| Support | 2 |

## Summary By Priority

| Priority | Actions |
| --- | ---: |
| `P1` | 48 |
| `P2` | 5 |

## Execution Queue

| # | ID | Priority | Owner | Phase | Action | Evidence required | Next command |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `EX-002` | `P1` | Engineering | Trust center execution | Add security overview summary for sales use. | Security overview section linked from trust center. | `OWNER_ACTION_REQUIRED` |
| 2 | `EX-007` | `P1` | Engineering | Trust center execution | Add retention and deletion summary to trust center. | Trust center links DATA_LIFECYCLE. | `OWNER_ACTION_REQUIRED` |
| 3 | `EX-008` | `P1` | Engineering | Trust center execution | Add backup and restore summary to trust center. | Trust center links BACKUP_RESTORE_RUNBOOK. | `OWNER_ACTION_REQUIRED` |
| 4 | `EX-009` | `P1` | Engineering | Trust center execution | Add incident response summary to trust center. | Trust center links incident/observability docs. | `OWNER_ACTION_REQUIRED` |
| 5 | `EX-056` | `P1` | Engineering | AI intelligence execution | Create implementation backlog for workflow id on AI usage events. | Spec includes engineering backlog row. | `OWNER_ACTION_REQUIRED` |
| 6 | `EX-003` | `P1` | Founder/legal | Trust center execution | Add legal approval tracker row for Terms. | Legal tracker shows owner, state, and evidence. | `OWNER_ACTION_REQUIRED` |
| 7 | `EX-004` | `P1` | Founder/legal | Trust center execution | Add legal approval tracker row for Privacy. | Legal tracker shows owner, state, and evidence. | `OWNER_ACTION_REQUIRED` |
| 8 | `EX-005` | `P1` | Founder/legal | Trust center execution | Add legal approval tracker row for DPA. | Legal tracker shows owner, state, and evidence. | `OWNER_ACTION_REQUIRED` |
| 9 | `EX-006` | `P1` | Founder/legal | Trust center execution | Add legal approval tracker row for subprocessors. | Subprocessor row exists with evidence owner. | `OWNER_ACTION_REQUIRED` |
| 10 | `EX-062` | `P1` | Marketing | Sales execution | Create evidence-gated outreach sequence for first ICP. | ICP outreach doc plus outreach readiness contract, compliance review gate, tracking requirement, and hosted evidence gap. | `OWNER_ACTION_REQUIRED` |
| 11 | `EX-012` | `P1` | Product | Commercial moat execution | Define Starter seats limit. | Starter plan row has seats limit. | `OWNER_ACTION_REQUIRED` |
| 12 | `EX-013` | `P1` | Product | Commercial moat execution | Define Starter workflows limit. | Starter plan row has workflow limit. | `OWNER_ACTION_REQUIRED` |
| 13 | `EX-014` | `P1` | Product | Commercial moat execution | Define Starter contacts limit. | Starter plan row has contacts limit. | `OWNER_ACTION_REQUIRED` |
| 14 | `EX-015` | `P1` | Product | Commercial moat execution | Define Starter AI budget limit. | Starter plan row has AI cap. | `OWNER_ACTION_REQUIRED` |
| 15 | `EX-016` | `P1` | Product | Commercial moat execution | Define Growth seats limit. | Growth plan row has seats limit. | `OWNER_ACTION_REQUIRED` |
| 16 | `EX-017` | `P1` | Product | Commercial moat execution | Define Growth workflows limit. | Growth plan row has workflow limit. | `OWNER_ACTION_REQUIRED` |
| 17 | `EX-018` | `P1` | Product | Commercial moat execution | Define Growth contacts limit. | Growth plan row has contacts limit. | `OWNER_ACTION_REQUIRED` |
| 18 | `EX-019` | `P1` | Product | Commercial moat execution | Define Growth AI budget limit. | Growth plan row has AI cap. | `OWNER_ACTION_REQUIRED` |
| 19 | `EX-020` | `P1` | Product | Commercial moat execution | Define Scale seats limit. | Scale plan row has seats limit. | `OWNER_ACTION_REQUIRED` |
| 20 | `EX-021` | `P1` | Product | Commercial moat execution | Define Scale workflows limit. | Scale plan row has workflow limit. | `OWNER_ACTION_REQUIRED` |
| 21 | `EX-022` | `P1` | Product | Commercial moat execution | Define Scale contacts limit. | Scale plan row has contacts limit. | `OWNER_ACTION_REQUIRED` |
| 22 | `EX-023` | `P1` | Product | Commercial moat execution | Define Scale AI budget limit. | Scale plan row has AI cap. | `OWNER_ACTION_REQUIRED` |
| 23 | `EX-027` | `P1` | Product | Industry template execution | Create real-estate WhatsApp sequence. | Template includes WhatsApp sequence. | `OWNER_ACTION_REQUIRED` |
| 24 | `EX-028` | `P1` | Product | Industry template execution | Create real-estate qualification rules. | Template includes qualification rules. | `OWNER_ACTION_REQUIRED` |
| 25 | `EX-030` | `P1` | Product | Industry template execution | Create clinic WhatsApp sequence. | Template includes WhatsApp sequence. | `OWNER_ACTION_REQUIRED` |
| 26 | `EX-031` | `P1` | Product | Industry template execution | Create clinic qualification rules. | Template includes qualification rules. | `OWNER_ACTION_REQUIRED` |
| 27 | `EX-033` | `P1` | Product | Industry template execution | Create education WhatsApp sequence. | Template includes WhatsApp sequence. | `OWNER_ACTION_REQUIRED` |
| 28 | `EX-034` | `P1` | Product | Industry template execution | Create education qualification rules. | Template includes qualification rules. | `OWNER_ACTION_REQUIRED` |
| 29 | `EX-036` | `P1` | Product | Industry template execution | Create agency WhatsApp sequence. | Template includes WhatsApp sequence. | `OWNER_ACTION_REQUIRED` |
| 30 | `EX-037` | `P1` | Product | Industry template execution | Create agency qualification rules. | Template includes qualification rules. | `OWNER_ACTION_REQUIRED` |
| 31 | `EX-039` | `P1` | Product | Industry template execution | Create ecommerce WhatsApp sequence. | Template includes WhatsApp sequence. | `OWNER_ACTION_REQUIRED` |
| 32 | `EX-040` | `P1` | Product | Industry template execution | Create ecommerce qualification rules. | Template includes qualification rules. | `OWNER_ACTION_REQUIRED` |
| 33 | `EX-042` | `P1` | Product | Activation execution | Define time_to_first_workflow event. | Metric spec includes event definition. | `OWNER_ACTION_REQUIRED` |
| 34 | `EX-043` | `P1` | Product | Activation execution | Define time_to_first_lead_action event. | Metric spec includes event definition. | `OWNER_ACTION_REQUIRED` |
| 35 | `EX-044` | `P1` | Product | Activation execution | Define onboarding_abandoned event. | Metric spec includes event definition. | `OWNER_ACTION_REQUIRED` |
| 36 | `EX-045` | `P1` | Product | Activation execution | Define template_selected event. | Metric spec includes event definition. | `OWNER_ACTION_REQUIRED` |
| 37 | `EX-046` | `P1` | Product | Activation execution | Define first_publish event. | Metric spec includes event definition. | `OWNER_ACTION_REQUIRED` |
| 38 | `EX-050` | `P1` | Product | AI intelligence execution | Define cost_per_workflow metric. | Workflow intelligence spec includes metric formula. | `OWNER_ACTION_REQUIRED` |
| 39 | `EX-051` | `P1` | Product | AI intelligence execution | Define cost_per_successful_action metric. | Workflow intelligence spec includes metric formula. | `OWNER_ACTION_REQUIRED` |
| 40 | `EX-052` | `P1` | Product | AI intelligence execution | Define degraded_fallback_rate metric. | Workflow intelligence spec includes metric formula. | `OWNER_ACTION_REQUIRED` |
| 41 | `EX-053` | `P1` | Product | AI intelligence execution | Define next_best_action v1 rules. | Workflow intelligence spec includes rule table. | `OWNER_ACTION_REQUIRED` |
| 42 | `EX-054` | `P1` | Product | AI intelligence execution | Define follow_up_quality_score rubric. | Workflow intelligence spec includes rubric. | `OWNER_ACTION_REQUIRED` |
| 43 | `EX-055` | `P1` | Product | AI intelligence execution | Define lead_qualification_confidence rubric. | Workflow intelligence spec includes rubric. | `OWNER_ACTION_REQUIRED` |
| 44 | `EX-024` | `P1` | Sales | Commercial moat execution | Define Enterprise proof requirements. | Enterprise row lists security, legal, SLA, and procurement proof. | `OWNER_ACTION_REQUIRED` |
| 45 | `EX-025` | `P1` | Sales | Commercial moat execution | Define paid onboarding package. | Pricing matrix includes onboarding package. | `OWNER_ACTION_REQUIRED` |
| 46 | `EX-059` | `P1` | Sales | Sales execution | Create evidence-gated pilot offer brief. | Pilot offer brief, pilot readiness contract, fit gate, owner model, success criteria, and hosted pilot evidence gap. | `OWNER_ACTION_REQUIRED` |
| 47 | `EX-010` | `P1` | Support | Trust center execution | Add support workflow summary to trust center. | Trust center links SUPPORT_WORKFLOW. | `OWNER_ACTION_REQUIRED` |
| 48 | `EX-048` | `P1` | Support | Activation execution | Create onboarding failure recovery checklist. | Checklist includes owners and triggers. | `OWNER_ACTION_REQUIRED` |
| 49 | `EX-064` | `P2` | Engineering | Enterprise execution | Define RBAC expansion requirements. | Enterprise backlog includes RBAC row. | `OWNER_ACTION_REQUIRED` |
| 50 | `EX-065` | `P2` | Engineering | Enterprise execution | Define workspace policy requirements. | Enterprise backlog includes workspace policy row. | `OWNER_ACTION_REQUIRED` |
| 51 | `EX-066` | `P2` | Engineering | Enterprise execution | Define audit export requirements. | Enterprise backlog includes audit export row. | `OWNER_ACTION_REQUIRED` |
| 52 | `EX-067` | `P2` | Engineering | Enterprise execution | Define SSO/OIDC requirements. | Enterprise backlog includes SSO row. | `OWNER_ACTION_REQUIRED` |
| 53 | `EX-068` | `P2` | Engineering | Enterprise execution | Define data residency position. | Enterprise backlog includes data residency row. | `OWNER_ACTION_REQUIRED` |
