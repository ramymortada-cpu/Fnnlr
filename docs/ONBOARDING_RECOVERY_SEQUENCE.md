# Onboarding Recovery Sequence

Purpose: recover users who start onboarding but do not reach first workflow or first publish.

Status: `CONTRACT_READY`

Code evidence:

- `modules/activation/src/recovery-readiness.ts` creates guarded recovery plans from activation metrics.
- `tests/onboarding-recovery-readiness.test.ts` verifies email/support/operator recovery triggers, abandonment evidence, and guardrails.

## Triggers

| Trigger | Recovery action |
| --- | --- |
| No industry selected | Send industry-selection prompt |
| No goal selected | Send goal-selection prompt |
| Template selected but not customized | Offer assisted setup |
| Workflow created but not published | Ask for blocker and offer checklist |
| No first signal after publish | Check tracking link, traffic source, and page status |

## Message Guardrails

- No guaranteed revenue.
- No auto-send claim.
- No fake urgency.
- Use Arabic-first language when customer market is Arabic.

## Owner

Support owns recovery during assisted GA. Product owns metrics and improvements.

## Claim Gate

Do not claim automated onboarding recovery until provider delivery, unsubscribe handling, and hosted evidence exist. Current status is recovery decisioning plus guarded message/task contract.
