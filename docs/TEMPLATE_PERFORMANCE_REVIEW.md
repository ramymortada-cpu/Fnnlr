# Template Performance Review

Status: `CONTRACT_READY`

Code evidence:

- `modules/activation/src/template-performance.ts` converts observed template signals into `PROMOTE`, `KEEP`, `REVISE`, `RETIRE`, or `INSUFFICIENT_EVIDENCE`.
- `modules/activation/src/template-performance.ts` reviews template-loop readiness without treating missing hosted cohort evidence as a pass.
- `tests/template-performance.test.ts` verifies high-performing templates, weak templates, low-evidence templates, missing recommendation outcome evidence, and the hosted cohort readiness gap.

Default thresholds:

| Threshold | Value |
| --- | ---: |
| Minimum selected count | `5` |
| Minimum publish rate | `60%` |
| Minimum first signal rate | `40%` |
| Minimum first lead action rate | `25%` |
| Minimum recommendation capture rate | `35%` |
| Maximum support issue rate | `20%` |

## Template

- Industry:
- Template id:
- Version:

## Metrics

| Metric | Value |
| --- | --- |
| Selected count |  |
| Published count |  |
| First signal count |  |
| First lead action count |  |
| Recommendation capture rate |  |
| Support issues |  |

## Decision

- Keep:
- Revise:
- Retire:
- Promote:

## Decision Rules

Use `INSUFFICIENT_EVIDENCE` when selected count is below threshold. Low sample size is not a pass.

Use `RETIRE` when operational blockers are broad or the publish rate is zero.

Use `REVISE` when activation, recommendation capture, or support evidence is weak but not broad enough to retire.

Use `PROMOTE` only when the template has enough sample size and strong publish plus lead-action performance.

Every revise/retire action must include:

- owner
- action
- evidence required for the next review

## Claim Gate

Status: `CONTRACT_READY_WITH_HOSTED_GAPS`

The template loop is not `TEMPLATE_LOOP_READY` until a hosted cohort review links selected workspaces, template version, decision, owner action, and follow-up evidence.
