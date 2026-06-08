# justificationreportinOCR

## Phase 1 scope

This phase repairs the OCR workflow architecture without changing the proven OCR engines, export logic, region OCR logic, table review logic, or Writer insertion logic.

The UI is restructured around the user workflow:

```txt
select source -> run OCR -> review text/regions/tables -> export/search/send to Writer
```

## Present logic intentionally preserved

### 1. Final OCR integration

Kept:

```txt
runFinalOcrIntegrationJob
createOcrExecutionPlan
runOcrBatchScheduler
runOcrPipeline
```

Justification:

The existing final integration path already coordinates execution planning, batching, OCR pipeline mode, diagnostics, and result merge. The defect was visual workflow architecture, not OCR execution correctness. The logic was moved behind `useOcrRunCoordinator` so `OcrPanel.tsx` is no longer the implementation dumping ground.

### 2. Region OCR and region-to-Writer path

Kept:

```txt
OcrRegionTool
OcrRegionActionPanel
resolveOcrRegionPageInput
createOcrWriterInsertionCandidate
upsertOcrWriterInsertionCandidate
OcrWriterInsertPanel
```

Justification:

The existing region flow already creates a selectable PDF region, runs OCR for that region, converts it to a Writer element, queues it, and inserts it into Writer. The repair keeps the behavior and places it under `Review and use result -> Capture region` so it reads as a user step.

### 3. Table review path

Kept:

```txt
OcrTableReviewPanel
createReviewedOcrTableWriterElement
```

Justification:

The table review model already supports accepting reviewed table data and converting it to a Writer table element. The repair keeps this logic and places it under `Review and use result -> Review tables`.

### 4. Searchable PDF export

Kept:

```txt
OcrSearchablePdfExportPanel
exportSearchableOcrPdf
```

Justification:

The export implementation already handles searchable text layer creation. The repair changes its workflow visibility only: before OCR, the user sees a compact hint; after OCR, the export panel becomes available in the result workspace.

### 5. Project restore and diagnostics

Kept:

```txt
OcrProjectRestorePanel
OcrDiagnosticsSection
OcrProgressPanel
```

Justification:

Project restore and diagnostics are useful but should not compete with the primary OCR task. They now live under collapsed Advanced OCR settings, with diagnostics forced open only when an OCR error exists.

## Phase 1 value additions

### Value addition 1: Monolithic panel reduced to a coordinator

`OcrPanel.tsx` is no longer a 700+ line mixed UI/state/diagnostics file. It now coordinates state and renders a workflow shell. Run-state logic and review-state logic are extracted into dedicated hooks.

### Value addition 2: Single professional OCR assistant shell

The new shell introduces one clear assistant surface:

```txt
OCR Assistant
compact source summary
primary Run OCR action
workflow status
review/use result workspace
collapsed source details
collapsed advanced settings
```

This prevents duplicate OCR workflow shells and keeps the run action visible above source and advanced details.

### Value addition 3: Primary workflow separated from advanced controls

Engine, profile, force OCR, pipeline mode, execution limits, batch queue, project restore, demo fixtures, and diagnostics are consolidated under `Advanced OCR settings`. They are no longer visually equal to the primary OCR workflow.

### Value addition 4: Source details moved into the workflow

The connected source card and source warnings are no longer rendered as a detached section below the main OCR panel. Valid source details are collapsed by default; warnings expand the source panel.

### Value addition 5: Browser workflow test added

A dedicated browser-style test now covers:

```txt
source summary -> run OCR -> result workspace -> search/review/region -> Writer insertion -> searchable PDF availability
```

### Value addition 6: Certification updated for new architecture

The static certification script now validates the assistant workflow components and no longer requires obsolete `OcrUnifiedPanel` markers to pass the OCR release gate.

## Module-size compliance

New or rewritten Phase 1 modules are kept under 300 source lines. The large old `OcrPanel.tsx` was split into smaller workflow components and hooks:

```txt
OcrPanel.tsx
useOcrRunCoordinator.ts
useOcrReviewCoordinator.ts
OcrAssistantShell.tsx
OcrHeaderSummary.tsx
OcrPrimaryActionBar.tsx
OcrResultWorkspace.tsx
OcrSourcePanel.tsx
OcrAdvancedPanel.tsx
OcrWorkflowStatus.tsx
```

## Remaining work for later phases

```txt
1. Fully retire OcrUnifiedPanel if repository search confirms no active route imports it.
2. Add focused tests for error-state diagnostics auto-expansion.
3. Continue visual tightening after the workflow architecture is certified.
```
