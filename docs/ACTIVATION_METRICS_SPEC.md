# Activation Metrics Spec

Purpose: make onboarding repeatability measurable instead of anecdotal.

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
