# Repeatable Disposable Staging Run

Status: `EVIDENCE_COLLECTED_GATE_NOT_APPROVED`

Container: `fnnlr-gateforge-postgres`

Host port: `55433`

Context: `DISPOSABLE_LOCAL_STAGING_POSTGRES`

This command builds a clean PostgreSQL server, applies control-plane migrations, runs the GateForge GA unblock evidence runner, and removes the container after evidence collection.

Expected GateForge interpretation:

- Runtime checks may pass in this disposable context.
- Full GA remains blocked until hosted provider evidence and legal/commercial human attestation are archived.
