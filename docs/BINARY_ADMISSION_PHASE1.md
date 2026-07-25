# Input Admission Program — Revised Source-Aligned Plan

## Status

This plan supersedes the initial generic eight-phase proposal.

It is based on the source audit in `docs/BINARY_ADMISSION_SOURCE_AUDIT.md` and on the repository state at:

- `main`: `3698ca06725ce3ed7a7e91a69d1af3d24eefb83a`;
- PR #132 head: `96463475d738076e95666a274bad2557e60776a3`;
- implementation draft: PR #133.

PR #132 is not merged by this plan.

## Program objective

Create one source-aligned admission system for user-controlled PDF, archive, image, OCR-project, and structured-text inputs while preserving:

- existing cancellation contracts;
- the command/document transaction boundary;
- macro resource budgets;
- document-history retention policy;
- Writer and OCR compatibility;
- PR #132 render scheduling and decoded-bitmap ownership.

The program must reject or contain unsafe work before irreversible state mutation. It must not create a second command runtime, transaction manager, renderer scheduler, or history policy.

## Governing architecture

```text
User input source
  -> source-specific metadata preflight
  -> bounded read / existing compatibility limit
  -> format and structure inspection
  -> source-specific measurements
  -> aggregate operation projection
  -> immutable staged result
  -> existing transaction or store commit boundary
  -> post-commit owned cleanup
```

Admission evidence records:

- operation profile;
- policy source and version;
- measured values;
- diagnostics;
- accepted/rejected/cancelled outcome;
- commit target.

## Policy authority model

Limits are classified, not flattened into one anonymous global table.

### `EXISTING_SOURCE_POLICY`

Values already governing repository behavior, including:

- FileAdapter single-file PDF limit;
- macro resource limits;
- document-history byte/depth limits;
- OCR raster canvas-pixel limit;
- PR #132 renderer concurrency and decoded-thumbnail cache limits after merge.

These values may be centralized without changing them, but their current applicability must be preserved.

### `OWNER_APPROVED_GLOBAL_POLICY`

New or expanded product policy explicitly approved for one or more operation profiles.

### `UNRESOLVED_POLICY`

A required dimension with no governing value. Production integration must either:

- preserve the narrower existing behavior; or
- remain disabled for that new dimension and return an authority-required diagnostic.

It must not silently become unlimited.

## Phase 0 — Dependency and branch control

### Scope

- keep PR #132 and PR #133 independent;
- do not merge PR #132 without explicit authorization;
- immediately before an authorized PR #132 merge, recheck exact head, base, diff, reviews, threads, and all required workflows;
- use the expected-head SHA guard;
- after merge, rebase or refresh PR #133 from the resulting main commit;
- preserve scheduler priority, concurrency, cache, lease, stale-result, and cleanup contracts.

### Exit gate

PR #132 merge commit is recorded, or the active slice is proven not to depend on its source paths.

## Phase 1 — Source authority consolidation and open-PDF vertical slice

This is the first implementation phase.

### 1A. Correct PR #133 foundation

Retain:

- deterministic admission outcomes and diagnostics;
- measured-value evidence;
- archive raw-path validation and collision reconciliation;
- explicit policy provenance.

Remove or redesign:

- the parallel `AdmissionOperationGate` lifecycle;
- the assertion that the repository has no existing numerical policies;
- policy profiles that have no mapped production owner or call site.

Reuse:

- `core/cancellation/operationCancellation.ts` for cancellation;
- existing transactions for commit and rollback.

### 1B. Create one primary PDF open coordinator

Proposed boundary:

```text
admitAndOpenPdfFile(file, source, options)
```

It owns:

1. metadata and extension/MIME diagnostics;
2. existing-compatible source-byte enforcement;
3. full read after metadata acceptance;
4. PDF signature diagnostics;
5. PDF-lib page-count validation with cancellation;
6. document hash;
7. final abort/generation check;
8. one `openDocument` call;
9. normalized error/toast/log evidence.

### Production call sites

- `pages/LandingPage.tsx`;
- `components/toolbar/ToolbarFile.tsx`;
- `components/workspace/DocumentWorkspace.tsx`;
- `adapters/file/FileAdapter.ts`.

The coordinator must eliminate the landing-page bypass and duplicated count/hash/open sequences.

### Explicit non-scope

- donor PDFs;
- ZIP extraction;
- image decoding;
- OCR project hydration;
- renderer policy changes;
- new global values beyond preserved existing behavior.

### Tests

- picker, drop, and workspace browse reach the same admission coordinator;
- over-limit metadata is rejected before `arrayBuffer`;
- non-PDF signature is rejected before count/hash/open;
- cancellation before commit prevents session mutation;
- a failed open preserves the active session;
- one accepted file produces one session commit;
- existing 100 MiB picker behavior does not regress until policy authority changes it.

### Exit gate

All primary PDF entry points use one coordinator and full repository certification passes.

## Phase 2 — Donor, command, macro, and batch admission

### Scope

Integrate admission with existing execution boundaries rather than UI-only handlers.

Primary files:

- `components/toolbar/ToolbarOrganize.tsx`;
- `components/sidebar/thumbnails/ThumbnailContextMenu.tsx`;
- `core/commands/dispatch.ts`;
- `core/commands/transaction/documentTransaction.ts`;
- `core/macro/resourceBudget.ts`;
- `core/macro/sessionRunner.ts`;
- `core/macro/batchRunner.ts`.

### Required behavior

- donor files are admitted before PDF-lib loading;
- donor file count and aggregate bytes reconcile with macro policies;
- insert and replace measure donor page count before mutation;
- merge projects aggregate input, parser, output, session-copy, and history-retention exposure;
- batch processing stops admitting new files when aggregate retained successes/output would cross policy;
- command mutations continue to commit only through `commitDocumentMutation`;
- cancellation and timeout suppress command dispatch and outputs;
- document-history accounting remains the retention authority.

### Exit gate

Every donor and batch route has deterministic admission evidence and no UI path can bypass command-level enforcement.

## Phase 3 — Writer project and embedded round-trip import

This phase precedes broad image migration because it contains the highest current transactional defect.

### 3A. Staged project import

Replace immediate Writer hydration with:

```text
read project
  -> inspect archive
  -> validate/reconcile all members
  -> validate original PDF or blank-document metadata
  -> construct immutable staged project
  -> snapshot Writer/OCR/session state
  -> one coordinated commit
  -> rollback snapshots on commit failure
```

Primary files:

- `core/writer-v2/export/projectZip.ts`;
- `core/writer-v2/export/projectImportController.ts`;
- `components/writer-v2/WriterV2ToolbarControls.tsx`;
- `core/writer-v2/writerV2Store.ts`;
- OCR stores used by project hydration;
- session store.

### 3B. Archive containment

Before JSZip map lookup can hide source records:

- inspect raw central-directory entries;
- preserve raw names and order;
- reject absolute, traversal, control-character, dot, empty-segment, duplicate, canonical-collision, and file/directory-collision paths;
- constrain entry count, individual declared expansion, aggregate declared expansion, and supported methods;
- measure actual expanded bytes while extracting;
- terminate extraction at the configured boundary;
- reconcile manifest paths, counts, IDs, references, fingerprints, and unknown entries;
- parse JSON through bounded byte/depth/node inspection.

JSZip may remain only if exact-version source and adversarial tests prove enforceable bounded extraction. Otherwise replace the import-side extraction implementation while preserving export compatibility.

### 3C. Embedded round-trip PDF

- distinguish no embedded project from rejected embedded project;
- bound name-tree depth, node count, attachment count, attachment names, and decoded attachment bytes;
- avoid retaining every decoded attachment when only the canonical project attachment is needed;
- validate the embedded ZIP through the same project importer;
- commit only after the containing PDF and project are both admitted.

### Compatibility fixtures

- current PDF-overlay projects;
- blank Writer projects;
- projects without OCR payload;
- projects with OCR payload;
- stale fingerprints currently normalized by import;
- round-trip PDFs produced by current export;
- unknown optional entries according to approved compatibility policy.

### Exit gate

A failed, rejected, cancelled, or stale project import leaves Writer, OCR, and session state unchanged.

## Phase 4 — Shared image admission and atomic Writer asset mutation

### Shared boundary

Create one image admission service used by active Writer V2, macro generation, clipboard/drop, and retained legacy paths.

Required stages:

1. source-byte check from `File.size`;
2. byte-level PNG/JPEG/WebP identification;
3. bounded dimension probe without full decode where supported;
4. width, height, pixel, projected decoded-byte, and projected data-URL-byte decisions;
5. decode/conversion only after acceptance;
6. staged asset record;
7. asset and element/editor mutation as one logical transaction;
8. removal of staged assets on downstream failure.

### Call sites

- `WriterBlankImageInsertButton.tsx`;
- `WriterRibbon.tsx`;
- `WriterV2Inspector.tsx`;
- `plugins/ImageDropPlugin.tsx`;
- `writerRichInsertActions.ts`;
- `writerImageBoxActions.ts`;
- `clipboard/imageAssetStore.ts`;
- `components/sidebar/MacrosSidebar.tsx` brand image;
- `components/writer/WriterElementNode.tsx`;
- `components/writer/RichTextEditorPanel.tsx`.

### Multi-input rules

Drop and clipboard operations require aggregate source, decoded, and retained-data budgets. Completion order must not determine element order or diagnostic order.

### Legacy decision

Legacy Writer image paths must either:

- use the same admission service; or
- be proven unreachable and removed in a separately reviewed compatibility change.

### Exit gate

No active image route can call `readAsDataURL`, decode an image, allocate a source-size canvas, or mutate an asset store before shared admission.

## Phase 5 — OCR project, OCR raster, and structured-text admission

### OCR project

Extend project reconciliation to enforce and evidence:

- JSON bytes, nodes, and depth;
- pages, words, lines, blocks, table cells, corrections, regions, and insertion candidates;
- manifest count equality;
- unique IDs and valid references;
- document fingerprint equality;
- aggregate retained object and string size projections.

### OCR raster

After PR #132 is merged:

- determine whether OCR rasterization can acquire the shared PDF.js document rather than copying bytes into a separate document;
- preserve the current 16,000,000-pixel execution clamp unless policy authority changes it;
- account for source canvas, optional crop canvas, and encoded image bytes;
- integrate cancellation with render-task cancellation and page/document cleanup;
- do not route OCR through the thumbnail cache unless ownership and quality requirements match.

### Structured text

Add bounded text admission for PS/ISONOTE CSV/TSV/TXT:

- source bytes before `file.text()`;
- decoded character bytes;
- row count;
- column count;
- maximum cell bytes;
- unique mapping count;
- deterministic duplicate/conflict diagnostics.

### Exit gate

All project JSON, OCR raster, and user-loaded structured-text paths have explicit operation profiles and bounded work amplification.

## Phase 6 — Resident-memory accounting and certification

Peak-memory policy is finalized only after actual integrations expose ownership and copy lifetimes.

### Accounting model

For each operation, account separately for:

- source files;
- admitted byte buffers;
- PDF-lib documents and serialized outputs;
- PDF.js document copies and render canvases;
- session original/working copies;
- undo/redo snapshots;
- Writer data URLs and assets;
- ZIP compressed and expanded members;
- OCR object graphs and raster bytes;
- queued batch outputs;
- PR #132 pinned thumbnail resources.

Avoid false precision: where library-internal allocations cannot be measured, record a conservative projection model and its assumptions.

### Adversarial certification

Required fixtures include:

- oversized and deceptive PDFs;
- high page count and extreme page dimensions;
- multi-file aggregate overflow;
- ZIP traversal, duplicates, canonical collisions, file/directory collisions, ZIP64, data descriptors, unsupported methods, encryption, false size metadata, high entry counts, and decompression bombs;
- deeply nested and high-node JSON;
- contradictory Writer/OCR manifest counts and references;
- extreme-dimension PNG/JPEG/WebP files;
- drop/clipboard completion races;
- cancellation during read, parse, extraction, decode, render, serialization, and immediately before commit;
- late completions after document or project replacement;
- current backward-compatibility project fixtures.

### Repository gates

- lint;
- strict TypeScript;
- complete Vitest suite;
- static architecture checks;
- production build;
- browser E2E;
- Frontend Certify;
- Frontend CI;
- Writer Overlay V2 certification;
- OCR Workflow Certification;
- admission-specific adversarial workflow.

## Immediate PR #133 disposition

PR #133 remains draft and must not merge in its initial form.

Completed source-alignment corrections:

1. replaced the parallel admission transaction state machine with a final checkpoint that delegates to shared cancellation;
2. added policy provenance and existing-source-policy classification;
3. retained archive path reconciliation as an import-side primitive;
4. documented the complete source-level ingress and retention map.

Remaining before the next production integration review:

1. narrow profiles and metrics to the first implemented vertical slice plus clearly marked reserved profiles;
2. implement the primary PDF open coordinator;
3. migrate LandingPage, ToolbarFile, and DocumentWorkspace browse paths;
4. add source-level regression tests;
5. run the complete certification matrix;
6. refresh from PR #132 merge only when that merge is explicitly authorized and completed.

## First coding target

```text
Phase 1B — one primary PDF open coordinator
```

This is the smallest production slice that:

- fixes a verified bypass;
- removes duplicated orchestration;
- preserves current user-visible size compatibility;
- uses existing cancellation and session mutation;
- establishes admission evidence without requiring archive, image, or peak-memory policy to be invented.
