# Subprocessors

Status: `DRAFT_READY_HUMAN_APPROVAL_REQUIRED`

This list is buyer-facing only after founder/legal approval. Do not mark it final until the actual production providers are confirmed.

| Provider | Purpose | Data categories | Status |
| --- | --- | --- | --- |
| Hosting provider | Application/API hosting | Business data, operational metadata | `TO_CONFIRM` |
| Managed Postgres provider | Control-plane and tenant databases | PII, business data, workflow records | `TO_CONFIRM` |
| Anthropic | AI assistance provider | Prompt context, AI outputs, limited business context | `TO_CONFIRM` |
| Resend or email provider | Transactional email | Email address, account/admin messages | `TO_CONFIRM` |
| Sentry or observability provider | Error monitoring | Error metadata, stack traces, operational context | `TO_CONFIRM` |
| Uptime monitor | Availability monitoring | Health endpoint status | `TO_CONFIRM` |

## Rules

- Do not include secret values.
- Do not include customer-specific data.
- Update this list before commercial GA.
- If a provider is replaced, update DPA/privacy references.
