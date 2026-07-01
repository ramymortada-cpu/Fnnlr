# Activation Metrics Spec

Purpose: make onboarding repeatability measurable instead of anecdotal.

Status: `CONTRACT_READY`

Code evidence:

- `modules/activation/src/metrics.ts` computes time-to-first-workflow, time-to-first-publish, time-to-first-lead-action, template selection, first signal, and abandonment state from observed activation events.
- `tests/activation-metrics.test.ts` proves missing evidence stays explicit instead of being treated as activation.
- `modules/activation/src/onboarding-readiness.ts` classifies industry and goal selection readiness without overstating UI/hosted proof.
- `modules/activation/src/onboarding-readiness.ts` maps supported industries and goals to first activation workflow, template id, primary metric, and support prompt.
- `tests/onboarding-readiness.test.ts` proves tailored onboarding remains gap-labeled until route and hosted persistence evidence exist, while supported industry/goal validation and workflow mapping are contract-ready.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| `time_to_first_workflow` | Time from workspace creation to first workflow/template created | Measures setup speed |
| `time_to_first_publish` | Time from workspace creation to first published funnel/page/workflow | Measures launch readiness |
| `time_to_first_lead_action` | Time from workspace creation to first human-approved lead action | Measures revenue-operation activation |
| `template_selected` | Industry template selected during onboarding | Measures template-market fit |
| `onboarding_abandoned` | Last completed onboarding step before exit | Finds setup friction |
| `first_signal_received` | First page view, WhatsApp click, lead, or payment-state signal | Confirms instrumentation works |

## Industry And Goal Claim Gate

Status: `CONTRACT_READY_WITH_ONBOARDING_GAPS`

- Industry and goal values are part of the activation event contract.
- Activation metrics expose selected industries and selected goals per workspace.
- Industry template briefs exist for the first wedge segments.
- Goal-to-workflow mapping is contract-ready for:
  - `get_more_leads` → lead capture/follow-up with `first_signal_received`.
  - `improve_whatsapp_conversion` → WhatsApp response loop with `time_to_first_lead_action`.
  - `reduce_payment_drop_off` → payment-state recovery with `time_to_first_lead_action`.
  - `launch_new_offer` → offer publish launch with `time_to_first_publish`.
  - `improve_follow_up` → follow-up recovery with `time_to_first_lead_action`.
  - `diagnose_revenue_leaks` → revenue leak diagnosis with `time_to_first_workflow`.
- Full tailored onboarding must stay unclaimed until route validation and hosted persistence proof are attached.

## Abandonment Learning Loop

Status: `CONTRACT_READY`

- `onboarding_abandoned` stores the last step and reason.
- Cohort summaries aggregate top abandonment steps and reasons instead of leaving them buried per workspace.
- Cohort reviews expose the repeated step/reason so Product and Support can remove the highest-friction onboarding question in the next review.

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
