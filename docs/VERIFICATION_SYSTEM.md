# Verification System for DocCraft Front‑End

This document outlines the verification strategy for the front‑end‐only
implementation of DocCraft.  It defines the types of tests and checks
required to maintain a high level of quality without depending on any back‑end
services.

## Static Gates

Static gates ensure that critical invariants are maintained in the codebase.
These gates can be run via simple `grep` commands or as part of a CI step.

| Gate | Check | Expected |
| --- | --- | --- |
| **Single React root** | `grep -r "createRoot" frontend/src | wc -l` | `1` |
| **No console logs** | `grep -rn "console.log" frontend/src || true` | `0 lines` |
| **No back‑end imports** | `grep -rn "import fitz" . || true` | `0 lines` |
| **No localStorage for annotations/OCR** | `grep -rn "localStorage" frontend/src/core/annotations frontend/src/core/ocr || true` | `0 lines` |
| **No final redaction** | `grep -rn "REDACTION_APPLY" frontend/src || true` | `0 lines` |
| **No insecure redaction claims** | `grep -rn "redaction complete" frontend/src || true` | `0 lines` |

Developers should run these commands locally before committing changes to
ensure compliance.

## Unit and Integration Tests

The project includes a minimal test structure under `tests/e2e` to exercise
high‑level user flows.  Because there is no back‑end, tests focus on
UI interactions and the command dispatcher.  Tests can be run with
`npm test` or an equivalent test runner once configured.

Key scenarios to cover:

1. **Viewer Smoke:** load a small PDF, render page 1, zoom in/out, scroll.
2. **Annotation Smoke:** add a highlight, create a comment, undo/redo the
   annotation.
3. **Write Overlay Smoke:** insert a text box, image overlay, and link.
4. **Organize Smoke:** select multiple thumbnails, reorder, delete, undo.
5. **Search Smoke:** search for a word in native text and OCR text.
6. **OCR Smoke:** run OCR preview on a page, verify results overlay.
7. **Generate Smoke:** create an AI command plan and preview diff.
8. **Redaction Guardrail Smoke:** mark a redaction region, delete it,
   export JSON, verify no apply button exists.

Test utilities should be added under `frontend/src/test-utils` as needed to
assist with rendering components and simulating events.

## Benchmark Tests

Basic performance benchmarks are included in `tests/benchmark` to ensure that
the viewer and other components remain responsive for typical document sizes.
Benchmarks may include:

* Time to first page render for a 10‑page PDF.
* Memory usage and scroll smoothness for a 100‑page PDF.
* Annotation rendering performance with 100 annotations.
* Overlay rendering performance with 50 writer elements.

Benchmarks should not block development but provide early warnings when
performance degrades significantly.

## Manual Verification

Until an automated end‑to‑end test suite is fully implemented, manual
verification remains important. Developers should run through the smoke tests
listed above using the UI to ensure that the application behaves as expected.

If a back‑end is integrated in the future, this document should be updated
with additional tests and gates covering server interactions, authentication,
and end‑to‑end workflows.