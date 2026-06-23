# Admin MFA Recovery Runbook

Status: OPERATOR_CONTROLLED

Admin MFA recovery is intentionally not self-service in v1. This avoids creating
a weak bypass around `/admin/*` and `/ops/*`.

Recovery process:

1. Verify requester identity out of band.
2. Confirm workspace and tenant ownership in the control-plane.
3. Record the support ticket or incident id.
4. Reset `users.mfa_enabled=false` and clear `users.mfa_secret_enc` for the
   verified user only.
5. Revoke existing sessions for that user.
6. Ask the user to login and run MFA setup again.

Evidence required:

- Operator id.
- User id.
- Workspace id.
- Reason.
- Timestamp.
- Session revocation confirmation.
