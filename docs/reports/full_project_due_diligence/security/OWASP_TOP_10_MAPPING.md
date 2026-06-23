# OWASP Top 10 Mapping

| Category | Repository status | Evidence | Gap |
|---|---|---|---|
| A01 Broken Access Control | Addressed for tenant header distrust and public resolver paths | tests/api.test.ts; tests/webhook-security.test.ts | Add full RBAC |
| A02 Cryptographic Failures | Credential encryption fails closed in production | modules/integrations/src/secrets.ts; tests/production-safety.test.ts | Key rotation/vault |
| A03 Injection | Services commonly use pg parameterization | modules/*/src | Add SAST |
| A04 Insecure Design | Proof/commercial boundaries encoded | modules/proof; modules/commercial | Formal threat modeling cadence |
| A05 Security Misconfiguration | ENV_SPEC and release checker exist | modules/release/src/env-spec.ts | Hosted CI enforcement |
| A06 Vulnerable Components | Minimal dependency set | package.json | Run npm audit/license review |
| A07 Auth Failures | Hashing and rate limits tested | modules/auth; tests/security-hardening.test.ts | MFA/reset missing |
| A08 Integrity Failures | No CI workflow found | Not found in repository | Add signed release pipeline |
| A09 Logging/Monitoring | Audit/events/runbooks exist | modules/execution; docs/LOGGING_RETENTION.md | External observability missing |
| A10 SSRF | No generic URL-fetch user input path found except outbound webhooks | modules/realtime/src/outbound.ts | Validate outbound targets |
