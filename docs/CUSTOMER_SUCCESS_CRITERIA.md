# fnnlr — Customer Success Criteria

> Honest success. No fake ROI. Revenue is only ever reported when real payment
> states exist; otherwise it is not claimed.

## Activation success
- [ ] Page published.
- [ ] Tracked WhatsApp link live.
- [ ] First event received (a real page view).
- [ ] First lead recorded.
- [ ] Revenue Desk shows an actionable item (evidence-based, not a fabricated
      opportunity).

## Operational success
- [ ] Daily check runs and returns a clear status + next action.
- [ ] Blockers are visible (never hidden); P0/P1 carry an owner and a next action.
- [ ] Recommendations appear **only** with enough observed evidence.
- [ ] The customer always knows the next action.

## Revenue success (only if payment states exist)
- [ ] Known payment states are tracked.
- [ ] No revenue is claimed unless it was actually observed
      (`payment_states.amount` exists).
- There is **no fake ROI** and **no guaranteed revenue**. If no payment amount has
  been recorded, fnnlr reports revenue as unknown — it does not estimate.

## What success does NOT mean
- It does not mean fnnlr sent messages or processed payments (it does neither).
- It does not mean a guaranteed number of sales.
- It does not mean recommendations exist regardless of data — they require
  evidence.
