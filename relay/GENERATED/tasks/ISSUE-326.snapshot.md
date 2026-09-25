# Task Snapshot — Issue #326 / STEP-13-08

> **Authority:** derived read model. PR/tests/runtime remain material truth.  
> **Programme parent:** #312 — Phase 13 bounded existing-PDF text editing  
> **Work issue:** #326 — direct on-page existing-text selection  
> **Operational ledger:** #327  
> **Delivery:** PR #328 — DRAFT / OPEN / mergeable  
> **Material basis:** `7576903086c623c5c7e38d7c3d7017d3cbb2c47c`

## Current disposition

| Dimension | State | Evidence |
| --- | --- | --- |
| Implementation plan | **PRESENT — rev 1** | #326 comment 5825802966 |
| Plan implementation | **COMPLETE — 7/7 slices** | Material implementation in PR #328 |
| Exact-head executable verification | **NOT_RUN / INFRASTRUCTURE** | GitHub jobs terminate before runner steps; local execution unavailable |
| Work-issue acceptance | **PARTIAL** | 1 PASS / 6 PARTIAL / 1 NOT_RUN |
| Programme contribution | **PARTIAL** | STEP-13-08 material exists; Phase 13 still has later sibling work |
| Delivery | **DRAFT** | PR #328 is not review-ready/merged |
| Provider issue | **OPEN** | #326 remains open |
| Mutation authority | **UNCHANGED** | Existing `REPLACE_EXISTING_TEXT` path remains canonical |

## Parent programme — #312 exit view

| Criterion | State | Current evidence / remaining |
| --- | --- | --- |
| AC-13-P01 — direct page selection targets exact revision/PageId/source item | **PARTIAL** | Material candidate exists; executable proof still NOT_RUN |
| AC-13-P02 — native replacement never bypasses validation | **PARTIAL** | Source/diff keeps existing capability path; retain executable regression proof |
| AC-13-P03 — reconstructed replacement uses separate command | **PENDING** | Future STEP-13-09; intentionally outside #326 |
| AC-13-P04 — stale identity cannot silently apply | **PARTIAL** | Rejection logic/tests exist; exact-head execution pending |
| AC-13-P05 — widened operator/font subsets have fixtures/save-reopen proof | **PENDING** | Future STEP-13-10/11 |
| AC-13-P06 — unsupported/reconstructed remains explicit | **PARTIAL** | #326 does not widen mutation authority |
| AC-13-P07 — normal viewer/search/text-selection/annotation compatibility | **NOT_RUN** | Runner execution unavailable |
| AC-13-P08 — validation truth reported exactly | **PASS** | NOT_RUN is preserved; no false PASS/FAIL claim |

**Programme exit denominator:** 1 PASS / 4 PARTIAL / 1 NOT_RUN / 2 PENDING.  
This is **not** a Phase-13 completion claim.

## Child issue — #326 acceptance

| Criterion | State | Current evidence / remaining |
| --- | --- | --- |
| AC-13.1-01 — rendered item exposes PDF.js source index | **PARTIAL** | Implemented + tests authored; execute certification |
| AC-13.1-02 — revisionId + PageId + sourceIndex binding | **PARTIAL** | Implemented; execute certification |
| AC-13.1-03 — page selection resolves exact Inspector span | **PARTIAL** | Implemented; execute UI proof |
| AC-13.1-04 — Inspector selection updates page highlight | **PARTIAL** | Implemented; execute UI proof |
| AC-13.1-05 — stale revision/PageId selection rejected | **PARTIAL** | Logic/tests exist; execute exact-head test |
| AC-13.1-06 — normal browser/text-mark behavior preserved | **NOT_RUN** | Compatibility execution unavailable |
| AC-13.1-07 — no new/widened mutation authority | **PASS** | Source/diff reconciliation |
| AC-13.1-08 — focused tests/audit document boundary | **PARTIAL** | Authored; executable run pending |

## Implementation-plan progress

- [x] STEP-326-01 — expose PDF.js source index.
- [x] STEP-326-02 — add revision/PageId/sourceIndex selection contract.
- [x] STEP-326-03 — publish direct page selection and route Inspector/mobile UI.
- [x] STEP-326-04 — highlight only the matching identity.
- [x] STEP-326-05 — resolve canonical span and reject stale identity.
- [x] STEP-326-06 — mirror Inspector selection back to page.
- [x] STEP-326-07 — add focused tests/audit/certification command.

**Implementation-plan progress: 7/7 slices materially present.**

## What is done

- Page ↔ Inspector synchronization is materially implemented.
- Selection identity is revisionId + stable PageId + PDF.js sourceIndex.
- Mobile and collapsed-Inspector routing defects found in review were corrected.
- Memo/stale-closure and hook-ordering review defects were corrected.
- Focused tests/audits and `pnpm run certify:phase13-existing-text-page-selection` exist.
- Mutation authority remains unchanged.

## What remains

- [ ] Execute focused certification on the current exact material basis.
- [ ] Execute/observe relevant UI/guardrail workflows on a functioning runner.
- [ ] Fix any product-code failures if execution exposes them.
- [ ] Publish terminal `TASK_RESULT` only after executable evidence exists.
- [ ] Move PR #328 to review-ready/merge only after that evidence.

## Expected next observable

An execution-capable surface runs:

`pnpm run certify:phase13-existing-text-page-selection`

against the current material basis. Product failures, if any, are fixed before readiness. If runner infrastructure still does not execute, keep the result **NOT_RUN**.

## Negative knowledge / preserve

- Do not treat provider runner failure with zero steps/logs as product PASS or FAIL.
- Do not add reconstructed replacement, operator/font expansion, OCR mutation, or paragraph reflow to #326.
- Do not bypass the existing Inspector capability evaluation or `REPLACE_EXISTING_TEXT` mutation path.
