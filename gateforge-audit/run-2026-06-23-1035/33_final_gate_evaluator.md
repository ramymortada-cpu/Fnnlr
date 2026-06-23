# Final Gate Evaluator

Status: `CI_PROTECTED`

The GateForge final decision now has a machine-checkable evaluator.

## Commands

Evaluate default runtime summary plus default hosted attestation packet:

```bash
npm run gateforge:final-gate
```

Run smoke coverage:

```bash
npm run gateforge:final-gate-smoke
```

## Decision Rule

The final gate returns `CONDITIONAL_GO` only when:

- every runtime check in `ga-unblock-evidence/summary.json` is `PASS`
- every required external attestation item is present
- every required external attestation status is `PASS`
- every required external attestation has owner and evidence references

Otherwise it fails closed as `CANNOT_APPROVE`.

## CI Coverage

GitHub Actions runs `npm run gateforge:final-gate-smoke` before the GateForge GA unblock evidence step.

The smoke proves:

- complete external evidence fixture produces `CONDITIONAL_GO`
- incomplete external template fails closed as `CANNOT_APPROVE`
