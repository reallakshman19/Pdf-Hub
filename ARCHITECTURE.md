# PDF Hub — Current Architecture

> **Authoritative architecture document.**
>
> This file describes the current product direction and implementation reality.
> Older documents that describe DocCraft as a FastAPI/PyMuPDF server-first product are historical and must not be used as implementation authority.

## Product model

PDF Hub is a **local-first, browser-based PDF workspace**.

The primary product runs as a static React application. PDF rendering, page operations, annotations, OCR, Writer overlays, macros, persistence, and save/export flows execute locally in the browser.

The product goal is a professional/personal/basic PDF editor with:
- professional page organization, numbering, headers/footers, automation, large-document handling, mobile/web UX, and a future external API;
- personal OCR, comments, review and editable annotations;
- bounded editing of existing PDF text.

A backend is not required for the current core product.

## Current technology

### Application
- React 19
- TypeScript
- Vite
- Zustand

### PDF
- PDF.js / `pdfjs-dist` for rendering and text extraction
- `pdf-lib` for current PDF mutation/writing
- virtualized page rendering with `virtua`

### Review / annotation
- application annotation model + IndexedDB persistence
- Konva / React-Konva for portions of interactive overlay tooling
- current PDF save path still flattens application annotations; native editable PDF annotation serialization is planned

### OCR
- Tesseract.js
- browser workers and batching
- searchable-PDF export
- confidence/correction/table/region workflows

### Writer
- Writer V2 / Lexical-based editing and positioned document elements
- legacy Writer code remains and must be retired or clearly isolated

### Automation
- macro recipe engine
- preflight/dry-run support
- macro builder
- specialized PS/ISONOTE workflows

## Architectural boundaries

The target dependency direction is:

```text
Desktop UI / Mobile UI / Macro / API / Agent
                  |
                  v
              CommandBus
                  |
                  v
         DocumentTransaction
                  |
                  v
           DocumentSession
        /      |       |       \
     Pages  Review   Writer    OCR
        \      |       |       /
                  v
             PDF Engine
                  |
                  v
           DocumentSource
```

Not every current subsystem has reached this target. Refactors must move toward it rather than add new parallel state/command systems.

## Mandatory invariants

### 1. One canonical command model
UI, macros, future external API and agent-generated operations must converge on one serializable command contract.

The repository currently contains overlapping architecture-level `PdfCommand` and dispatch-level `DocumentCommand` models. This is acknowledged technical debt, not a pattern to extend.

### 2. One canonical state per concept
There should be one authoritative representation for:
- page
- annotation
- review thread
- OCR result/correction
- Writer element
- macro recipe
- document session

Do not add duplicate status or metadata fields as compatibility shortcuts without a migration plan.

### 3. Stable page identity
Page number/index is presentation state, not durable identity.

The target model uses a stable `PageId`, while visible page number, PDF `/PageLabels`, and printed page-number overlays are separate concepts.

### 4. One geometry service
PDF coordinates, rendered viewport coordinates and screen coordinates must be converted through shared geometry code.

Do not introduce feature-specific fixed page assumptions such as 595 × 842.

### 5. Original source is immutable during an editing session
The original PDF is the recovery anchor. Editing occurs through working state / operations and is compiled on save.

### 6. Save semantics must be explicit
The target semantics are:
- **Save / Save As:** preserve editable PDF-native annotations and supported editable document state
- **Export Flattened:** burn visual annotations/overlays into page content
- **Searchable PDF Export:** add OCR text layer
- **Download:** download the current persisted/working PDF representation

The current implementation does **not yet satisfy this target**. See `Docs/SAVE_SEMANTICS.md`.

## Current session and mutation model

`DocumentSession` currently stores original and working PDF bytes as `Uint8Array`.

Page mutations are dispatched through `core/commands/dispatch.ts` into `PdfEditAdapter`, with document transactions coordinating PDF bytes, annotations and history.

Current limitations:
- page identity is primarily index/number based;
- document history retains whole-PDF byte snapshots under a byte budget;
- several subsystems retain their own undo/history mechanisms;
- many structural operations load/rewrite the complete PDF.

These are migration targets, not desired long-term architecture.

## Rendering and large documents

PDF.js rendering is virtualized and cached. This is good and should be preserved.

However, the file layer currently reads the complete PDF using `File.arrayBuffer()` and applies a 100 MB admission limit. Therefore the app is **not yet a genuine large-PDF architecture** even though the UI is virtualized.

The target is a `DocumentSource` abstraction supporting random/range reads and OPFS/native-file-backed working data.

## OCR architecture

The OCR engine is intentionally local.

Production OCR UI must operate on the real active document. Demo/QA fixtures may remain as test infrastructure but must not be mounted in normal user workflows.

OCR region selection must ultimately occur against actual rendered page geometry rather than synthetic fixed-size preview canvases.

## Annotation and review architecture

Annotations and review/discussion are distinct concepts.

Target:
- `Annotation` = visual markup/anchor
- `ReviewThread` = review status and discussion
- `ReviewMessage` = individual message/reply

The current implementation still embeds review metadata in annotation data. Phase 1 will separate these concerns and add native PDF annotation serialization.

## Visual masks vs secure redaction

A visual mask is **not secure redaction**.

Current browser functionality can draw opaque page content but does not prove removal of underlying text, images, OCR text, annotations or content streams.

User-facing UI must call this feature **Visual Mask** and show the capability warning. Legacy internal command/op identifiers containing the word `redaction` may remain temporarily for compatibility but must not be presented as secure behavior.

## Desktop and mobile

Desktop and mobile should share the engine and document model but may have separate interaction shells.

The existing `MobileShell` approach is intentional. Do not replace it with desktop UI merely compressed by CSS.

## Testing requirements

Maintain a permanent PDF fidelity corpus covering, at minimum:
- ordinary and scanned PDFs
- mixed page sizes and rotations
- CropBox / MediaBox differences
- bookmarks/outlines
- PageLabels
- AcroForms
- existing annotations
- attachments and metadata
- tagged PDFs
- CID/subset fonts
- Arabic/CJK/RTL
- object streams and incremental revisions
- encrypted and signed PDFs
- malformed-but-readable xrefs

For structural mutations, test:
1. open
2. mutate
3. save
4. reopen
5. validate/render
6. mutate again
7. save again
8. reopen again

## Roadmap authority

The active product roadmap is tracked in GitHub issue **#167**.

When an old design/work-item document conflicts with:
1. this file,
2. issue #167, or
3. current production code,

treat the old document as historical unless it has been explicitly re-authorized.

## What not to add yet

Until the stabilization roadmap is complete, avoid expanding:
- annotation type count
- OCR subsystems/panels
- macro operation count
- parallel command/history systems
- cloud/backend architecture
- collaboration
- signature creation
- Word-like global text reflow

The immediate objective is coherence, correctness and PDF fidelity—not feature count.


## Canonical command and history architecture

All PDF-backed product mutations converge on the serializable `PdfCommand` contract and `CommandBus.execute(...)`. The internal dispatcher is not a second public mutation surface.

```text
UI / Mobile / Automate / future SDK / future agent
                         |
                         v
                    CommandBus
                         |
                         v
                DocumentTransaction
                         |
                         v
                  DocumentSession
```

Document history is chronological across page operations, annotations, Writer V2 PDF overlays, and Automate commits. Page operations restore dependent annotation and Writer state in the same transaction.

Writer V2 keeps its local undo stack only for standalone `blankDocument` authoring. PDF-overlay Writer mutations create `WRITER_CHANGE` transactions in global document history.

Execution-only binary resources remain out-of-band so command/history records stay serializable.

See `Docs/OPERATION_CONTRACT.md` for the authoritative operation invariants. The Phase 4 static audit prevents the retired duplicate command registry/store and subsystem-local PDF history from returning.


## Stable page identity foundation

Document sessions now carry a `PageGraph` when a PDF is admitted through a production open path.

Each `PageNode` separates:
- stable `pageId`
- mutable zero-based `currentIndex`
- source page number
- PDF-point dimensions
- page rotation
- future logical `/PageLabels` value

Primary PDF admission builds the initial graph from PDF.js page metrics. The session layer stores the graph but does not depend on PDF.js.

Until structural commands become PageGraph-aware in Phase 5C, legacy `replaceWorkingCopy(...)` invalidates `pageGraph` instead of retaining stale page identity data. Non-structural committed saves preserve PageIds and rekey the graph metadata when the content hash/document key changes.

`pageCount` remains a compatibility field during migration; when PageGraph is present, its page count must agree with `pageGraph.pages.length`.


### Structural PageGraph transactions

Structural PDF commands now compute PageGraph changes before the document transaction commits. The same transaction snapshot contains PDF bytes, PageGraph, annotations, Writer state, selection, and current page.

Identity semantics:
- rotate: preserve PageId; update rotation
- reorder: preserve PageId; change currentIndex/order
- split/delete: remove affected PageIds
- insert donor pages: create new destination PageIds
- insert blank: create a new PageId
- duplicate: preserve source PageId and create a new duplicate PageId immediately after it
- replace page: preserve the target PageId while adopting donor page dimensions/rotation
- merge: preserve existing PageIds and append newly created destination PageIds

Undo/redo restores the exact PageGraph snapshot with the corresponding byte revision.

`APPLY_WORKING_COPY` remains an opaque whole-document boundary: because the macro output does not yet expose structural intent as canonical page commands, PDF Hub rebuilds a fresh PageGraph for that output. Phase 5H will tighten Automate/API identity semantics once persistent PageId selectors are exposed.

Rotation remapping uses PageGraph page metrics rather than reparsing the PDF once per selected page.


### Annotation and review PageId anchors

PDF-backed annotations now use `pageId` as canonical page identity. The existing one-based `pageNumber` remains during migration as a derived rendering/navigation coordinate.

Boundary rules:
- legacy IndexedDB/native-PDF annotations may arrive with only `pageNumber`
- annotation hydration upgrades them to the active PageGraph PageId
- structural page commands preserve/re-resolve annotations by PageId
- deleting a page removes annotations anchored to that PageId
- duplicating a page copies its annotations onto the duplicate PageId
- replacing page content preserves the page node identity but retains the existing product behavior of removing annotations attached to replaced content
- ReviewThread anchors project the annotation PageId
- native PDF serialization still uses physical page placement; PageId is application identity and is reconstructed from PageGraph on reopen

`APPLY_WORKING_COPY` is still an opaque compatibility boundary and rebinds annotations by their current physical page number onto the rebuilt output PageGraph.


### Writer V2 PageId anchors

PDF-overlay Writer V2 elements use `pageId` as canonical page identity. Their zero-based `pageIndex` remains a derived render/export coordinate during migration.

Rules:
- legacy persisted Writer elements are upgraded from pageIndex to PageId when a PDF-overlay session hydrates
- placement/add/update paths normalize PageId against the active PageGraph
- explicit pageIndex retargeting resolves a new PageId; generic Writer patches cannot set PageId directly
- structural PDF commands preserve/re-resolve Writer elements by PageId
- duplicate-page copies Writer elements onto the new duplicate PageId
- replace-page preserves the PageNode identity but retains existing behavior of removing Writer content attached to the replaced page content
- opaque `APPLY_WORKING_COPY` rebinds PDF-overlay Writer elements by current pageIndex onto the rebuilt PageGraph
- persisted/autosaved PDF-overlay Writer state is normalized before storage

Standalone blank Writer documents deliberately remain pageIndex-based. PDF structural commands and history restoration do not impose PDF PageIds on blank-document elements.


### OCR PageId anchors

Page-scoped OCR state now uses stable `PageId` as its canonical PDF page identity while retaining zero-based `pageIndex` as an execution/render coordinate.

The anchored OCR transaction state includes:
- OCR page results and nested words/lines/blocks
- corrections
- OCR regions
- review focus
- selected OCR pages

Structural semantics:
- reorder/insert/merge: existing OCR follows its PageId and receives the new physical pageIndex
- delete/split: OCR attached to removed PageIds is removed
- rotate: OCR geometry is rotated in bottom-left PDF coordinates and page dimensions are updated
- duplicate: the original page retains OCR; the newly duplicated page is intentionally unprocessed rather than cloning OCR target IDs
- replace-page: the stable PageId survives, but OCR for the replaced content is invalidated
- opaque `APPLY_WORKING_COPY`: OCR may rebind by physical index only when page count is unchanged; page-count-changing opaque output clears OCR

Every committed PDF mutation rekeys bound OCR state to the new document revision. Active OCR jobs are cleared at commit, and stale job/direct-result writes whose fingerprint no longer matches the active document are ignored.

Document history snapshots and restores OCR together with bytes/PageGraph so structural undo/redo restores the matching OCR page state.

Current Phase 5 history is still snapshot-based. OCR state therefore contributes additional memory pressure even though the retained-byte budget currently accounts primarily for PDF bytes. Delta/checkpoint history remains a later large-document architecture task rather than being expanded inside this PageId migration.
