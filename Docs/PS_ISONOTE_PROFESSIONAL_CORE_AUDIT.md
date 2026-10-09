# Professional Vector Callout & Obstacle-Aware Layout Core Audit Guide

This document is the official architectural audit guide and certification reference for the four stacked draft pull requests upgrading the **PS No. → ISONOTE Annotation** macro to a native professional vector callout core.

## 1. Architectural Stack Overview

The architectural layers are structured into four sequential, independent stacked pull requests:

```text
main
 └─ PR 1: vector contracts (#148 / feat/professional-vector-callout-core)
     └─ PR 2: placement solver (#149 / feat/obstacle-aware-layout-core)
         └─ PR 3: user review state (#150 / feat/visual-review-workflow-core)
             └─ PR 4: identity and verification (#151 / feat/layout-bound-verification-core)
```

All four remain intentional draft PRs until final manual certification and integration into the active macro.

---

## 2. Detailed Audit Matrix by PR Layer

### PR 1 — Professional Vector Callout Core (`feat/professional-vector-callout-core`)
- **Core Responsibility**: Pure callout model, engineering-oriented style contract, metric-based text wrapping, and auditable rectangle/line/circle/text render primitives. No raster-image primitive.
- **Files to Inspect**:
  - `frontend/src/core/macro/psIsonote/professional/model.ts`
  - `frontend/src/core/macro/psIsonote/professional/typography.ts`
  - `frontend/src/core/macro/psIsonote/professional/vectorCalloutPlan.ts`
  - `frontend/src/core/macro/psIsonote/professional/vectorCalloutPlan.test.ts`
- **Design Questions**:
  - *Why avoid HTML-to-PNG callout rendering?* Raster bitmaps degrade at print scaling and obscure underlying CAD vectors. Native vector shapes guarantee infinite resolution and compliance with engineering drawing deliverables.
  - *How is box height calculated without DOM?* Proportional font metric estimation and character aspect ratio calculations compute deterministic wrapping independently of browser execution.
- **Required Invariants**:
  - Native vector primitives strictly enforced (`rectangle`, `line`, `circle`, `text`). Zero raster image fallback permitted.
  - Neutral professional styling (slate text `#0f172a`, white box `#ffffff`, dark slate border) for standard output. Orange is strictly reserved for visual review states.
  - Shorthand confidence codes included (`(C=H)`, `(C=M)`, `(C=L)`, `(C=P)`).
- **Adapter Boundaries**: Isolates pure mathematical drawing geometry from PDF-lib canvas syntax and DOM Canvas rendering.
- **Deliberate Non-Goals**: No interaction handling or placement collision solving at this layer.

---

### PR 2 — Obstacle-Aware Layout Core (`feat/obstacle-aware-layout-core`)
- **Core Responsibility**: Ten placement classes, hard and soft obstacles, orthogonal leaders, deterministic scoring, beam-search page solving, collision rejection, and explicit `unplaceable` results.
- **Files to Inspect**:
  - `frontend/src/core/macro/psIsonote/professional/layoutTypes.ts`
  - `frontend/src/core/macro/psIsonote/professional/layoutGeometry.ts`
  - `frontend/src/core/macro/psIsonote/professional/layoutEngine.ts`
  - `frontend/src/core/macro/psIsonote/professional/layoutEngine.test.ts`
- **Design Questions**:
  - *Why 10 placement classes instead of free-floating layout?* Eight local orientations (`top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `top-left`) guarantee organized callouts near targets, while two edge fallbacks (`margin-right`, `margin-left`) accommodate high-density drawing cores.
  - *Why beam search instead of simple greedy placement?* Beam search evaluates multi-callout interactions globally across the page, avoiding localized blind spots where early greedy choices box in subsequent tags.
- **Required Invariants**:
  - Hard rejection for page boundary, title-block, existing callout box, and leader-line conflicts.
  - Explicit diagnostic penalties for soft obstacles (existing text and CAD drawing density).
  - **No silent bad placement**: unresolvable occurrences become explicitly flagged with status `unplaceable` rather than overlapping a protected obstacle.
- **Adapter Boundaries**: Consumes generic coordinate obstacle rectangles; decoupled from specific PDF.js page text or graphics extraction mechanics.
- **Deliberate Non-Goals**: Interactive drag/drop adjustments and persistence of user edits.

---

### PR 3 — Visual Review Workflow Core (`feat/visual-review-workflow-core`)
- **Core Responsibility**: Immutable review state, manual movement, approval, suppression, reset, page reflow, audit events, and a fail-closed commit gate.
- **Files to Inspect**:
  - `frontend/src/core/macro/psIsonote/professional/reviewState.ts`
  - `frontend/src/core/macro/psIsonote/professional/reviewState.test.ts`
- **Design Questions**:
  - *Why must manual movement revoke approval?* A manually dragged callout might visually occlude critical unindexed diagram lines; requiring explicit re-approval forces engineering confirmation.
- **Required Invariants**:
  - Immutable state updates: every operation generates an immutable audit event (`init`, `move`, `approve`, `suppress`, `reset`, `reflow`).
  - Manual movement immediately transitions style to orange review-only mode and requires explicit user re-approval.
  - Unplaceable results must be either manually repositioned and approved, or suppressed by the reviewer.
  - **Fail-closed commit gate**: commit execution is completely blocked while any unapproved or unplaceable occurrence remains in state.
  - Committed callouts must exactly match the approved review state and revert to normal neutral styling.
- **Adapter Boundaries**: Exposes immutable state transforms for UI viewer preview components without direct dependency on React/Vue rendering loops.
- **Deliberate Non-Goals**: Persistent database storage or binary PDF document serialization.

---

### PR 4 — Layout-Bound Verification Core (`feat/layout-bound-verification-core`)
- **Core Responsibility**: Layout hashes, v3 markers, visible-text verification, duplicate/mismatch detection, review-bound audit manifests, and focused CI certification.
- **Files to Inspect**:
  - `frontend/src/core/macro/psIsonote/professional/verificationCore.ts`
  - `frontend/src/core/macro/psIsonote/professional/auditManifestBinding.ts`
  - `frontend/src/core/macro/psIsonote/professional/index.ts`
  - `frontend/src/core/macro/psIsonote/professional/verificationCore.test.ts`
  - `frontend/src/core/macro/psIsonote/professional/auditManifestBinding.test.ts`
  - `Docs/PS_ISONOTE_PROFESSIONAL_CORE_AUDIT.md`
- **Design Questions**:
  - *Why include geometry, text, quality, and style in the layout hash?* Any tampering with callout positions, text contents, confidence indicators, or styling invalidate the mathematical hash, ensuring absolute audit traceability between review approval and generated output.
  - *Why check visible searchable text in addition to marker presence?* A valid hidden marker could theoretically exist alongside a malformed or invisible drawing primitive; verifying searchable text guarantees that engineering notes remain accessible to downstream PDF indexing and human reading.
- **Required Invariants**:
  - Marker identity contract:
    ```text
    PDFHUBISONOTE[v3|<PS suffix>|<mapping hash>|<occurrence ID>|<layout hash>|<style version>]
    ```
  - Exactly one matching marker is required per committed callout after writing; omissions and duplicates cause strict failure.
  - **Marker success alone is insufficient** when expected visible searchable text (`Tag: ...`, `ISO Note: ...`) is absent from extracted document text.
- **Adapter Boundaries**: Binds output verification reports directly to user review audit manifests.
- **Deliberate Non-Goals**: Modifying the active macro runtime in this PR (PDF.js extraction, viewer preview, and PDF-lib vector rendering integration remain subsequent follow-up tasks).

---

## 3. Integration Order & Next Steps

Once the draft PRs pass architectural audit and obtain explicit user approval:
1. Merge PR 1 (#148 / `feat/professional-vector-callout-core`) into `main`.
2. Rebase and merge PR 2 (#149 / `feat/obstacle-aware-layout-core`) into `main`.
3. Rebase and merge PR 3 (#150 / `feat/visual-review-workflow-core`) into `main`.
4. Rebase and merge PR 4 (#151 / `feat/layout-bound-verification-core`) into `main`.
5. Connect active macro runtime (`psIsonoteRecipe.ts`, `psIsonoteTable.ts`, PDF viewer overlays, and PDF-lib writers) to consume `professional/index.ts`.

---

## 4. Certification Commands

Run these targeted verification commands inside `frontend/`:

### Dependency & Typecheck Verification
```bash
npx tsc --noEmit
```

### Dedicated Professional-Core Test Suite
```bash
npm test -- --pool=forks --maxWorkers=1 src/core/macro/psIsonote/professional/
```
