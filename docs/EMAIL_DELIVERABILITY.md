# Email Deliverability

Status: STAGING_EVIDENCE_REQUIRED

Transactional email defaults to Resend for staging/GA evidence. Required env:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

Required DNS/provider evidence before GA:

- SPF includes the provider.
- DKIM verified by provider.
- DMARC exists for the sending domain.
- Provider test email succeeds.
- Bounce/rejection monitoring is assigned to support/ops.

fnnlr should use transactional email only for account/security/admin messages in
this stage, not marketing campaigns.
