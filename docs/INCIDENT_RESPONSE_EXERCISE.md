# Incident Response Exercise

Status: CONTRACT_READY_WITH_HOSTED_GAP

Purpose: rehearse incident ownership before GA.

## Current Evidence

- `modules/operating-room/src/incidents.ts` classifies P0/P1/P2/P3 incidents from observed operating evidence.
- `modules/operating-room/src/decision.ts` maps P0/P1 incidents into rollback/hold decisions.
- `modules/operating-room/src/incident-readiness.ts` defines the drill readiness gate.
- `tests/operating-room.test.ts` proves the classifier and decision gate behavior.
- `tests/incident-readiness.test.ts` proves the drill cannot be claimed ready while hosted drill output, sanitized evidence capture, customer communication decisions, or follow-up action evidence remain gap-labeled.

## Exercise Scenarios

| Scenario | Severity | Expected owner | Evidence |
| --- | --- | --- | --- |
| Hosted API unavailable | P0 | Engineering/operator | uptime alert, incident log, restore/rollback decision |
| Tenant isolation suspicion | P0 | Engineering/security | request trace, tenant ids, containment decision |
| Webhook replay spike | P1 | Engineering | replay/idempotency logs |
| AI spend cap exceeded | P1 | Engineering/operator | AI usage events and fallback logs |
| Email delivery failure | P1 | Support/operator | provider delivery logs |
| Data export/delete request | P1 | Support + legal | export/delete command output |

## Drill Checklist

1. Open incident record.
2. Assign owner.
3. Identify customer impact.
4. Capture sanitized evidence.
5. Decide mitigation.
6. Record customer communication decision.
7. Close with follow-up actions.

## GateForge Evidence

Attach drill output to hosted staging attestation before GA.

## Claim Gate

Do not claim "incident response drill ready" until all required capabilities in `INCIDENT_DRILL_BASELINE` are `READY` or `CONTRACT_READY` with evidence attached. A documented checklist is useful, but GA readiness requires a hosted/staging drill artifact showing owner, impact, sanitized evidence, mitigation decision, customer communication decision, and follow-up actions.
