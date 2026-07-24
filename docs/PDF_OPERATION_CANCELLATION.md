# PDF Operation Cancellation

PDF Hub treats cancellation as a first-class execution outcome rather than an ordinary macro failure.

## Result states

Macro execution reports one of four states:

- `success`
- `failed`
- `cancelled`
- `timed-out`

Cancellation and timeout always suppress pending side effects and restore the pre-run transaction snapshot. Session mutation is permitted only after a successful result and a final abort check immediately before command dispatch.

## Propagation

`AbortSignal` is propagated through session, headless, and batch macro entry points, the shared macro runtime budget, nested conditional steps, and PDF edit operations used by macro steps.

PDF-lib does not currently expose interruption for parsing or serialization already executing. PDF Hub therefore races those promises against the abort signal, checks the signal between page operations, rejects late results, and never commits their bytes.

## Maintenance rules

- New macro entry points must accept and propagate `AbortSignal`.
- New composite steps must use the shared runtime budget and perform the resource/cancellation check before applying side effects.
- New PDF edit operations should accept `PdfEditOperationOptions` or an options object containing `signal`.
- A cancelled or timed-out operation must not be added to the output queue or session history.
