# Procurement Checklist

Buyer-safe packet for larger customers.

| Question | Current answer |
| --- | --- |
| Is tenant data isolated? | DB-per-tenant architecture; hosted proof pending |
| Are secrets encrypted? | Yes, production fails closed without keys |
| Does fnnlr process payments? | No, GA v1 records payment state only |
| Does fnnlr auto-send WhatsApp? | No, human approval/send remains required |
| Is there a DPA? | Human/legal approval required |
| Is there a subprocessor list? | Required before GA |
| Is there a restore drill? | Runbook exists; hosted proof pending |
| Is there monitoring? | Runbook exists; provider proof pending |
| Is there SSO? | Roadmap |
| Is there SOC2? | Roadmap |
