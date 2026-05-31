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

The project includes a robust unit and integration test suite using **Vitest**. Tests cover the state stores, coordinate transformations, custom Lexical nodes (e.g. `ImageNode`), table helpers, and the high-fidelity PDF block export pipeline (`richTextRenderer.test.ts`).

To execute all unit and integration tests:
```powershell
npx.cmd pnpm --dir frontend test
```

## E2E Automated Smoke Tests

A complete E2E test suite has been established using **Playwright**. The tests launch the development server and run a headless Chromium browser against the production build or dev environment.

Key E2E coverage includes:
1. **Static Mode Loader**: Assures the workspace mounts fully, loads all UI components, and displays the non-dismissible preview/static mode banner at the top of the viewport.
2. **Component mounting**: Assures all sidebar panels, toolbars, and primary canvas structures mount without JavaScript runtime errors.

To run the Playwright E2E smoke tests:
```powershell
npx.cmd playwright test
```

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