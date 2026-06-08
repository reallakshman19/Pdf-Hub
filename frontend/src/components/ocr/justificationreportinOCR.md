# OCR Workflow Refactor Justification Report

## Purpose

This report records where the OCR professional workflow refactor agrees with the present implementation and where the UI architecture must change.

## Phase 1 agreement with present logic

### OCR execution pipeline

Retain:

- `runFinalOcrIntegrationJob`
- `runOcrPipeline`
- `createOcrExecutionPlan`
- `createOcrExecutionPolicy`

Justification:

The current defect is workflow architecture, not OCR engine execution. The existing execution functions already separate final OCR integration, pipeline selection, and execution limits. Replacing them during the UI redesign would increase regression risk without improving the user workflow.

### OCR store integration

Retain:

- `useOcrStore`
- OCR job snapshot application
- low-confidence word state
- region state
- table review state
- search index state

Justification:

The store already represents the OCR product concepts required by the redesigned workflow. The refactor should change presentation and task flow, not persisted OCR semantics.

### Writer insertion path

Retain:

- `createOcrWriterInsertionCandidate`
- `createOcrWriterInsertionQueue`
- `insertOcrWriterQueueIntoWriterV2Store`
- `OcrWriterInsertPanel`

Justification:

Writer insertion is already implemented as a distinct capability. The current issue is that it appears disconnected from the review workflow. The refactor will reposition it under “Review and use result.”

### Searchable PDF export

Retain:

- `OcrSearchablePdfExportPanel`

Justification:

The export panel already owns searchable PDF mechanics. The workflow repair should gate and position export after OCR completion instead of rewriting export internals.

## Phase 1 value additions

1. A canonical `OcrAssistantShell` now exists so connected OCR screens can avoid duplicate and nested workflow shells.
2. A compact `OcrHeaderSummary` now makes the PDF identity, page count, selected scope, and source state visible at the top.
3. Source details and Demo / QA fixtures are moved into secondary/collapsible workflow slots instead of appearing as normal primary OCR actions.

## Phase 1 blocking-review fixes

1. The OCR workflow CI now uses the repo-safe Corepack install path and targeted OCR gates instead of duplicating the full release workflow.
2. The connected header/source model now uses the same effective PDF bytes, page count, selected pages, and document fingerprint that are passed into `OcrPanel`.
3. Source and Advanced disclosure panels now own controlled open state and only auto-open when a real default-open condition becomes true.
4. Unused placeholder architecture files were removed from Phase 1 instead of being carried as dead future code.
5. Tests now cover direct `pdfBytes` input and demo-fixture-loaded source transitions.

## Logic to reorganize in later phases

### `OcrPanel.tsx`

Change:

`OcrPanel.tsx` should stop acting as the full visible workflow. It may remain a state coordinator, but visual composition must move into smaller workflow components.

Justification:

It currently mixes execution controls, engine settings, review, export, diagnostics, project restore, batch queue, and developer/QA controls in one visible hierarchy.

### Diagnostics

Change:

Diagnostics must be collapsed by default and only become prominent when there is an error.

Justification:

Diagnostics are valuable for support and QA, but they should not compete with the normal OCR task.

### Demo fixtures

Change:

Demo fixtures must live under Advanced / Demo / QA fixtures or be hidden in production mode.

Justification:

Fixture loading is not a normal PDF user workflow action.
