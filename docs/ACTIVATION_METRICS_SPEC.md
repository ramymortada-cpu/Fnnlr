# Activation Metrics Spec

Purpose: make onboarding repeatability measurable instead of anecdotal.

Status: `CONTRACT_READY`

Code evidence:

- `modules/activation/src/metrics.ts` computes time-to-first-workflow, time-to-first-publish, time-to-first-lead-action, template selection, first signal, and abandonment state from observed activation events.
- `tests/activation-metrics.test.ts` proves missing evidence stays explicit instead of being treated as activation.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| `time_to_first_workflow` | Time from workspace creation to first workflow/template created | Measures setup speed |
| `time_to_first_publish` | Time from workspace creation to first published funnel/page/workflow | Measures launch readiness |
| `time_to_first_lead_action` | Time from workspace creation to first human-approved lead action | Measures revenue-operation activation |
| `template_selected` | Industry template selected during onboarding | Measures template-market fit |
| `onboarding_abandoned` | Last completed onboarding step before exit | Finds setup friction |
| `first_signal_received` | First page view, WhatsApp click, lead, or payment-state signal | Confirms instrumentation works |

## Required Event Fields

- `tenant_id`
- `workspace_id`
- `business_id`
- `event_name`
- `occurred_at`
- `industry`
- `goal`
- `template_id`
- `source`

## Review Cadence

- Daily during customer zero/customer one onboarding.
- Weekly after public beta.
- Every failed onboarding must produce a reason, owner, and next action.

## Implementation Notes

- The metrics contract is pure and ready for route/database wiring.
- A workspace without a `workspace_created` event or first-value events remains incomplete with `missingEvidence`.
- Cohort summaries use medians so one slow onboarding does not distort the operating review.
