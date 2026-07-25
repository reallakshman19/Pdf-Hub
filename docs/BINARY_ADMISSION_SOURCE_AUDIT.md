# Binary and Structured-Input Admission — Source Audit

## Status

This document records the source-level audit performed before production admission controls are integrated.

Baseline:

- repository: `reallaksh19/Pdf-Hub`;
- audited branch: `main` at `3698ca06725ce3ed7a7e91a69d1af3d24eefb83a`;
- render dependency: PR #132 at `96463475d738076e95666a274bad2557e60776a3`;
- implementation draft: PR #133.

PR #132 is not merged by this work.

## Executive finding

Pdf-Hub does not have one unprotected file-open path. It has several distinct input and retention systems:

1. primary PDF opening;
2. donor PDF operations and batch macros;
3. Writer project ZIP and embedded round-trip project import;
4. Writer image upload, drop, clipboard, replacement, and legacy image paths;
5. OCR project JSON and PDF rasterization;
6. structured text input for PS/ISONOTE mapping;
7. output, session, renderer, and undo-history retention.

The repository already contains important resource and transaction authorities. New admission code must consolidate and extend them rather than creating a parallel runtime.

## Existing authorities that must be preserved

### Cancellation

`core/cancellation/operationCancellation.ts` supplies the shared cancellation error, abort checkpoint, and promise race.

PDF edit operations, macro execution, batch execution, rendering, search, and OCR already use this contract in several paths.

### Document mutation transaction

`core/commands/transaction/documentTransaction.ts` is the mutation commit boundary for command-driven PDF changes. It:

- prepares page counts and the next document hash;
- persists dependent annotations before in-memory mutation;
- snapshots session, annotation, and history stores;
- commits history, working bytes, annotations, and document identity;
- restores store snapshots if synchronous commit fails.

Admission must run before this transaction and provide it with admitted inputs. A second generic commit gate must not replace or bypass this transaction.

### Macro resource budget

`core/macro/resourceBudget.ts` already owns bounded JSON, graph depth, node count, recipe steps, embedded data, input PDF bytes, donor count and bytes, execution duration, working PDF bytes, output count, and output bytes.

These values are existing source policy. They are not automatically global product policy, but they cannot be described as nonexistent or ignored.

### Document history budget

`core/document-history/historyPolicy.ts` owns the undo-depth and retained-snapshot-byte policy. Admission projections for document mutations must account for this store instead of introducing a disconnected peak-memory number.

### OCR raster canvas limit

`core/ocr/pdfPageRasterizer.ts` defaults to a 16,000,000-pixel canvas ceiling and scales rasterization down to fit it. This is an execution policy for OCR rasterization, not an input-image acceptance policy.

### PR #132 rendering policy

PR #132 establishes the shared render scheduler, concurrency ceiling, thumbnail decoded-byte cache, lease ownership, stale-result suppression, and cleanup behavior. Admission work must consume those contracts after PR #132 is merged and must not redefine them.

## Source ingress map

### Primary PDF opening

| Entry point | Current path | Source concern |
|---|---|---|
| `pages/LandingPage.tsx` | drop -> `arrayBuffer` -> count -> hash -> `openDocument` | bypasses `FileAdapter` validation and suppresses errors |
| `components/toolbar/ToolbarFile.tsx` | picker -> count -> hash -> `openDocument` | duplicates open orchestration |
| `components/workspace/DocumentWorkspace.tsx` | picker -> extra byte copy -> count -> hash -> `openDocument` | duplicates open orchestration and immediately starts full-document text indexing |
| `adapters/file/FileAdapter.ts` | picker metadata check -> full `arrayBuffer` | 100 MiB is local, single-file policy; multiple selection has no aggregate limit |

`core/session/store.ts` clones admitted PDF bytes into both `originalBytes` and `workingBytes`. `PdfRendererAdapter` hashes copied bytes and provides another copied buffer to PDF.js. Source-byte admission therefore does not describe actual retained memory.

### Donor PDFs and batch processing

`components/toolbar/ToolbarOrganize.tsx` supplies full donor byte arrays for merge, insert, replace, and batch operations.

`components/sidebar/thumbnails/ThumbnailContextMenu.tsx` contains another replace-donor path.

`core/commands/dispatch.ts` is the shared command boundary for insert, replace, merge, and working-copy replacement. Donor admission and operation projection belong at or before this boundary.

`core/macro/batchRunner.ts` processes files sequentially but retains every successful output until the report is returned. Aggregate retained output must therefore be measured, not only per-file input.

### Writer project ZIP import

`core/writer-v2/export/projectZip.ts` currently:

- loads the complete ZIP with JSZip;
- reads full JSON strings;
- reads the complete original PDF;
- reads every asset into a byte array;
- converts assets to base64 data URLs;
- reads the optional OCR payload;
- returns all materialized values together.

Manifest counts are written but are not reconciled against imported arrays. Archive paths, duplicates, collisions, unknown entries, expanded bytes, JSON depth, and aggregate retained bytes are not globally bounded.

`core/writer-v2/export/projectImportController.ts` hydrates Writer state immediately after ZIP/PDF extraction.

`components/writer-v2/WriterV2ToolbarControls.tsx` only validates and opens the project PDF after Writer hydration. A later PDF failure can therefore leave imported Writer state active. This is a transactional correctness defect, not merely a future optimization.

### Embedded round-trip project PDF

`core/writer-v2/export/roundTripPdfImport.ts` loads the full PDF through PDF-lib, walks the embedded-file name tree, decodes attachments, retains all collected attachment byte arrays, and searches them for ZIP signatures.

Invalid embedded project data is converted to an ordinary `null` result. The path needs bounded attachment discovery and a diagnostic distinction between no project and a rejected embedded project.

### Writer and macro image input

Active Writer V2 paths:

- `WriterBlankImageInsertButton.tsx`;
- `WriterRibbon.tsx`;
- `WriterV2Inspector.tsx`;
- `plugins/ImageDropPlugin.tsx`;
- `writerRichInsertActions.ts`;
- `writerImageBoxActions.ts`;
- `clipboard/imageAssetStore.ts`.

Legacy paths still rendered by the application:

- `components/writer/WriterElementNode.tsx`;
- `components/writer/RichTextEditorPanel.tsx`.

Macro generation also accepts a brand image in `components/sidebar/MacrosSidebar.tsx`.

Most paths trust MIME prefixes, materialize a complete data URL, and mutate Writer or editor state asynchronously. WebP paths can decode the full image and allocate a source-dimension canvas before any shared pixel decision. Some paths add an asset before the associated editor or element operation succeeds, creating orphan assets.

### OCR project and rasterization

`core/ocr/ocrProjectCodec.ts` reads complete JSON members and deeply clones result structures. It validates schema and fingerprints but does not reconcile manifest counts or globally bound JSON bytes, depth, nodes, pages, blocks, words, regions, corrections, or insertion candidates.

`core/ocr/pdfPageRasterizer.ts` creates another PDF byte copy and another PDF.js document when supplied bytes. It has its own canvas-pixel clamp and can allocate an additional crop canvas.

### Structured text input

`components/sidebar/PsIsonoteRecipeBuilder.tsx` accepts CSV, TSV, and text files through `file.text()` with no source-byte, row, column, cell, or mapping-count admission. The resulting mapping drives PDF scanning, annotation generation, and evidence packaging.

A program called only “binary admission” would leave this user-controlled allocation and work-amplification path outside the safety boundary.

## Source-level defects and gaps

### Critical

1. Writer project import mutates Writer state before the project PDF is validated and opened.
2. Landing-page PDF drop bypasses the only existing picker size/type check.
3. ZIP import fully materializes archive members without structural, expanded-byte, or aggregate controls.
4. Image paths can decode or canvas-convert extreme images before a shared pixel decision.

### High

5. Primary PDF open orchestration is duplicated across three UI paths.
6. Session, renderer, PDF-lib, history, and search indexing multiply retained memory beyond source bytes.
7. Round-trip PDF import decodes embedded attachments before bounded project admission.
8. Manifest counts and references are not reconciled for Writer or OCR projects.
9. Multi-file picker and batch execution lack one shared aggregate admission decision.
10. Several asynchronous image paths can partially mutate state or leave orphan assets.

### Medium

11. Existing policy constants have no common provenance/authority map.
12. Structured text import is unbounded.
13. Errors are inconsistently surfaced; some paths suppress invalid input as absence.
14. Active and legacy Writer paths require separate migration and retirement decisions.

## Corrections to the initial plan

The initial plan is superseded in these respects:

- do not claim that all numerical policies are absent;
- do not introduce `AdmissionOperationGate` as a parallel transaction lifecycle;
- do not defer transactional Writer-project import until a late generic phase;
- do not organize implementation only by file format;
- do not limit the program to binary files while text imports remain unbounded;
- do not add a global peak-memory limit before mapping actual retained copies and existing budgets;
- do not require PR #132 to merge before policy inventory, open-path consolidation, ZIP structure work, or staged import design can proceed;
- do require PR #132 before renderer and shared OCR-render integration is finalized.

## Revised implementation order

The governing plan is maintained in `docs/BINARY_ADMISSION_PHASE1.md`.
