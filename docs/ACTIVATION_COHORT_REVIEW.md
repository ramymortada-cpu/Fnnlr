# Activation Cohort Review

Status: `CONTRACT_READY`

Code evidence:

- `modules/activation/src/metrics.ts` computes time-to-value and missing evidence from observed activation events.
- `modules/activation/src/cohort-review.ts` converts weekly cohort metrics into `HEALTHY`, `WATCH`, or `RESCUE` decisions.
- `modules/activation/src/cohort-review.ts` includes the top abandonment step and reason inside owner actions so Product and Support can act on the highest-friction setup issue.
- `tests/activation-metrics.test.ts` verifies healthy cohorts, weak cohort rescue actions, top abandonment step/reason aggregation, thresholds, and missing evidence behavior.

Default thresholds:

| Threshold | Value |
| --- | ---: |
| Minimum first workflow rate | `75%` |
| Minimum first publish rate | `60%` |
| Minimum first lead action rate | `40%` |
| Maximum abandonment rate | `20%` |
| Maximum median time to first workflow | `45 minutes` |

## Cohort

- Period:
- Segment:
- Industry:
- Acquisition source:

## Metrics

| Metric | Value | Notes |
| --- | --- | --- |
| Workspaces created |  |  |
| Template selected rate |  |  |
| First workflow rate |  |  |
| First publish rate |  |  |
| First signal rate |  |  |
| First lead action rate |  |  |
| Median time to first workflow |  |  |
| Median time to first publish |  |  |
| Top onboarding abandonment step |  |  |
| Top onboarding abandonment reason |  |  |

## Decisions

- Template changes:
- Onboarding copy changes:
- Support playbook changes:
- Product backlog changes:

## Rescue Rules

Any cohort with three or more blockers is `RESCUE`.

Any cohort without first-workflow timing evidence is `RESCUE`; missing evidence is not treated as a pass.

Any cohort over the abandonment threshold must name the top abandonment step and reason before the review can be closed.

Every rescue action must name:

- owner
- action
- evidence required for next review

Abandonment rescue actions must include the top repeated setup step and reason; unknown step/reason values stay explicit instead of being treated as a pass.
