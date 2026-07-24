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

When no abort signal is supplied, macro steps preserve the established adapter call shape and omit the optional operation-options argument entirely. This keeps existing integrations and tests compatible without weakening cancellation when a signal is present.

## Additional boundaries

- PDF.js page rendering, thumbnail rendering, text extraction, document search, and outline traversal accept abort signals. Render tasks call `cancel()` when aborted.
- Thumbnail and search components abort obsolete work on dependency changes and unmount. Page proxies and document leases remain protected by `finally`.
- Tesseract OCR propagates cancellation rather than converting it to a failed page, revokes temporary image sources, and terminates workers exactly once.
- The macro panel exposes Cancel controls and adds outputs only for successful runs.

## Certification boundaries

Cancellation regressions are covered across macro transactions, session commit suppression, PDF-lib editing, PDF.js render-task cancellation, Tesseract worker termination, and resource-budget timeout behavior. The normal release matrix additionally exercises lint, strict TypeScript, the complete Vitest suite, static architecture checks, production builds, E2E smoke tests, writer certification, and the OCR workflow certification.

## Maintenance rules

- New macro entry points must accept and propagate `AbortSignal`.
- New composite steps must use the shared runtime budget and perform the resource/cancellation check before applying side effects.
- New PDF edit operations should accept `PdfEditOperationOptions` or an options object containing `signal`.
- A cancelled or timed-out operation must not be added to the output queue or session history.
