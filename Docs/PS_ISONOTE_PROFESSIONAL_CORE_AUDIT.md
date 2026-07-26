# PS No. → ISONOTE Professional Annotation Core Audit

This document describes the four stacked audit PRs. The implementation is intentionally split into pure core modules before it is connected to the active macro, PDF writer, React viewer, or Konva overlay.

## Stack

1. **PR 1 — vector core**
   - Domain model, professional style, metric-based wrapping, vector render-plan generation.
2. **PR 2 — layout core**
   - Obstacles, candidate generation, geometry, scoring, deterministic page solver.
3. **PR 3 — review core**
   - Immutable visual-review state, manual override rules, suppression, reflow, commit gate.
4. **PR 4 — verification core**
   - Layout hashes, v3 marker codec, visible-text checks, review-bound audit manifest.

## Deliberate non-goals of this stack

The stack does not yet:

- replace `place_rich_textbox` in the active macro;
- draw primitives through `PdfEditAdapter`;
- collect all PDF.js text rectangles;
- rasterize pages into drawing-density grids;
- render temporary callouts in the viewer;
- persist manual review state;
- modify the current v2 marker parser or verifier.

Those are integration tasks after the core contracts are approved.

---

## PR 1 audit checklist

Files:

- `frontend/src/core/macro/psIsonote/professional/model.ts`
- `frontend/src/core/macro/psIsonote/professional/typography.ts`
- `frontend/src/core/macro/psIsonote/professional/vectorCalloutPlan.ts`
- `frontend/src/core/macro/psIsonote/professional/vectorCalloutPlan.test.ts`

Review questions:

- Are PDF.js top-left coordinates an acceptable core convention?
- Are the default widths, font sizes, padding, border widths, and colors suitable for engineering drawings?
- Should normal callouts remain neutral and orange remain review-only?
- Is failure on text overflow preferable to silent clipping or automatic expansion?
- Are the vector primitive contracts sufficient for both PDF and viewer renderers?

Invariants:

- No raster-image primitive exists.
- Visible text remains available as text in the render plan.
- The style version is explicit and must match the callout plan.
- Invalid geometry and insufficient box height fail closed.

---

## PR 2 audit checklist

Files:

- `frontend/src/core/macro/psIsonote/professional/layoutTypes.ts`
- `frontend/src/core/macro/psIsonote/professional/layoutGeometry.ts`
- `frontend/src/core/macro/psIsonote/professional/layoutEngine.ts`
- `frontend/src/core/macro/psIsonote/professional/layoutEngine.test.ts`

Review questions:

- Are the ten candidate classes sufficient: eight local positions plus two margin positions?
- Which obstacle kinds should be hard versus soft by default?
- Are the score weights ordered correctly: content protection, collision avoidance, leader length, side preference?
- Is beam width 32 acceptable for expected page density?
- Should leader-to-leader crossing be a hard rejection or a high review penalty?
- Should margin fallback be review-required or accepted as clean on configured templates?

Invariants:

- Hard obstacles reject a candidate.
- Soft obstacles create explicit diagnostics and weighted penalties.
- Accepted callouts do not overlap each other within configured clearance.
- Accepted leaders do not cross accepted callout boxes or leaders.
- The same input and settings produce the same plan.
- No safe candidate produces `unplaceable`; the solver does not silently select a bad location.

Obstacle-adapter contract:

- PDF text items should become `pdf-text` obstacles.
- The matched PS text rectangle should become `matched-anchor` and should not also remain as a normal text obstacle.
- Template exclusions should become hard `title-block` or `reserved-region` obstacles.
- Raster occupancy cells should become weighted soft `drawing-ink` obstacles, preferably merged into rectangles before solving.

---

## PR 3 audit checklist

Files:

- `frontend/src/core/macro/psIsonote/professional/reviewState.ts`
- `frontend/src/core/macro/psIsonote/professional/reviewState.test.ts`

Review questions:

- Should clean placements be auto-approved, or should every occurrence require explicit approval?
- Is suppression an acceptable workflow outcome, and what reason metadata should be required?
- Should a manual move always require reapproval?
- Should reflow preserve only manual placements, or also previously approved automatic placements?
- Which audit actor and timestamp fields should be added at the integration boundary?

Invariants:

- Review and unplaceable placements begin pending.
- An unplaceable placement cannot be approved without moving it.
- A manual move returns the occurrence to pending.
- Suppressed occurrences are omitted from committed callouts.
- Commit fails closed while pending or unplaceable items remain.
- Workflow changes produce deterministic sequence-numbered audit events.

---

## PR 4 audit checklist

Files:

- `frontend/src/core/macro/psIsonote/professional/verificationCore.ts`
- `frontend/src/core/macro/psIsonote/professional/verificationCore.test.ts`

Review questions:

- Does the canonical layout payload include every field that affects visible output?
- Is rounding geometry to 0.01 PDF units appropriate?
- Should quality and status styling be included in the layout hash? The current answer is yes.
- Is visible-text presence a sufficient runtime check, with rendered-pixel comparison reserved for CI?
- Should v3 markers coexist with v2 during migration, and for how long?
- Should the audit manifest include page-render hashes when screenshot certification is implemented?

V3 marker structure:

```text
PDFHUBISONOTE[v3|<PS suffix>|<mapping hash>|<occurrence id>|<layout hash>|<style version>]
```

Invariants:

- Geometry, content, quality, or style changes alter the layout hash.
- Exactly one matching marker is required.
- Related markers with different mapping, layout, or style identities produce distinct failure states.
- Marker success without expected searchable visible text is not treated as verified.
- A commit-ready audit manifest cannot be created while review is incomplete.
- The manifest binds both the approved callout plan and the review audit trail.

---

## Required integration order after approval

1. Create a PDF.js obstacle adapter and occupancy-grid adapter.
2. Add a temporary viewer renderer for vector render plans.
3. Store `PsIsonoteReviewState` against the active PDF identity and mapping identity.
4. Add a batched `place_ps_isonote_callouts` macro operation.
5. Implement a PDF-lib primitive renderer using Helvetica and Helvetica Bold.
6. Write v3 markers in the same atomic PDF operation as visible callouts.
7. Extend the existing post-write verifier to use professional expectations.
8. Add fixed-DPI screenshot fixtures for sparse, dense, title-block, rotated, and OCR drawings.
9. Migrate the macro UI from width/font-only controls to preview, review queue, reflow, margin fallback, and commit gate.

## Certification commands after integration

Run from `frontend/`:

```bash
pnpm typecheck
pnpm vitest run src/core/macro/psIsonote/professional
pnpm lint
pnpm build
```

The core stack was authored through the GitHub connector, so local commands were not executed during creation. GitHub CI results should be treated as the execution evidence for these draft PRs.
