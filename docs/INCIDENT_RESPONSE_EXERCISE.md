# Incident Response Exercise

Purpose: rehearse incident ownership before GA.

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
