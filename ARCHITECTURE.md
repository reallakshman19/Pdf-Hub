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

Canonical PDF mutations are dispatched through `core/commands/dispatch.ts` into the engine-neutral `PdfMutationEngine` / transaction-local `PdfMutationSession`. `PdfLibMutationEngine` is the current implementation. Legacy `PdfEditAdapter` helpers remain for compatibility and artifact-producing paths that have not yet migrated.

Document transactions still coordinate committed PDF bytes, PageGraph state, annotations, Writer, OCR and history above the engine boundary.

Current limitations:
- document history retains whole-PDF byte snapshots under a byte budget;
- compatibility/non-session transaction paths still use parse-based page-count fallback when authoritative revision metadata is unavailable;
- several compatibility/artifact paths still use `PdfEditAdapter`;
- many structural mutations still rebuild or save the complete PDF even though they now reuse one parsed active revision inside the mutation session.

These are migration targets, not desired long-term architecture.

## Rendering and large documents

PDF.js rendering is virtualized and cached. This is good and should be preserved.

The app is **not yet a genuine large-PDF architecture** even though the UI is
virtualized. The 100 MB primary admission policy and whole-byte working/history
revisions still bound practical scale.

Phase 8A defined the engine-neutral `DocumentSource` random/range-read
contract plus `MemorySource` and ranged `BrowserFileSource` adapters.

Phase 8B now routes primary PDF admission through `BrowserFileSource`:
format identification uses an at-most 1024-byte range read, and accepted files
are materialized for current consumers through one explicit chunked
`materializeDocumentSource(...)` bridge. Primary admission no longer calls
whole-file `File.arrayBuffer()` directly.

The immutable original source is retained out-of-band under a runtime
`sourceId`; `DocumentSession` stores that ID separately from the SHA-256
`documentKey`.

Phase 8C.1 added the engine-neutral `WorkingRevisionStore` boundary with
`MemoryRevisionStore` fallback and persistent `OpfsRevisionStore`. Committed
revision IDs are immutable: a new revision is fully written and verified before
it can become visible, and cancellation/failure does not publish partial OPFS
bytes. Committed OPFS revisions reopen through `OpfsSource`, which implements
the same random-access `DocumentSource` contract.

Phase 8C.2 makes primary admission/session revision-aware. Browser admission
prefers OPFS, falls back to memory when OPFS initialization fails, and
publishes/reuses the SHA-256 `documentKey` as the initial immutable working
revision before committing the session. `DocumentSession` carries a runtime
`revisionStoreId`, immutable `originalRevisionId`, and content-addressed
`activeRevisionId`.

Phase 8C.3 applies the same revision-first rule to canonical PDF mutations.
After the mutation engine produces output bytes, `DocumentTransaction`
validates/hashes them, publishes or reuses the matching immutable working
revision, then persists annotations and switches session/PageGraph/Writer/OCR
state. Revision publication receives the command cancellation signal. A
revision-aware transaction fails instead of silently degrading if its working
revision store cannot publish. PDF history records the matching active revision
id for undo/redo, while still retaining compatibility byte snapshots.

Phase 8D.1 adds the renderer-side source substrate without changing production
workspace acquisition yet. `PdfJsDocumentSourceTransport` maps PDF.js range
requests directly to `DocumentSource.read(...)`, and
`PdfRendererAdapter.acquireDocumentSource(...)` uses an explicit
content-addressed revision key instead of hashing/cloning the whole PDF.
Source-backed cache entries are internally namespaced away from byte-backed
entries so admission-time byte loading cannot silently mask the range path.
Existing lease/ref-count/LRU behavior remains authoritative.

Phase 8D.2 migrates the primary workspace onto that source path. A small
session-side resolver maps complete revision metadata to
`WorkingRevisionStore.open(activeRevisionId)`; byte fallback is allowed only
for legacy sessions with no revision metadata at all. The workspace lease
reacts to revision identity changes and passes cancellation into source
acquisition.

The former workspace-open full-document text-indexing loop has been removed.
Search indexing is no longer an automatic `1..numPages` side effect of opening
a PDF; Phase 8F owns incremental visible/nearby-first indexing.

Session `originalBytes`/`workingBytes`, mutation-engine input, Save
composition and history byte snapshots remain materialized. Search, Bookmarks
and Select Box Copy still migrate in Phase 8D.3; Phase 8E later migrates
history consumption.

See `Docs/DOCUMENT_SOURCE.md`, `Docs/WORKING_REVISION_STORE.md` and issue
#218.

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

The active post-merge execution sequence is tracked in GitHub issue **#185**.
Issue **#167** remains the original Professional / Personal / Basic
requirements record, but its phase numbering is historical where #185
supersedes it. Phase-specific tracking issues such as #218 may refine a slice
without changing #185's order.

When an old design/work-item document conflicts with:
1. this file,
2. issue #185,
3. the active phase tracking issue, or
4. current production code,

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

`APPLY_WORKING_COPY` remains an opaque whole-document boundary for legacy multi-step macro recipes: because those recipes do not yet expose structural intent as canonical page commands, PDF Hub rebuilds a fresh PageGraph for their output. PageLabels automation does not extend this seam; it uses a direct canonical `SET_PAGE_LABELS` task instead. General macro PageId continuity remains future command-compilation work.

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


### Session navigation PageId anchors

DocumentSession now treats page navigation identity separately from display position:

- `viewState.currentPageId` is the canonical current-page identity
- `viewState.currentPage` is the derived one-based UI/render position
- `selectedPageIds` is the canonical selected-page set
- `selectedPages` is the derived one-based compatibility selection

Existing UI surfaces may continue to call numeric `setPage(...)` and `setSelectedPages(...)`; SessionStore resolves those inputs to PageIds whenever PageGraph is present. PageId-native callers can use `setPageById(...)` and `setSelectedPageIds(...)`.

When PageGraph order changes, SessionStore preserves current/selected PageIds and recomputes their numeric positions. If a selected PageId is deleted, it leaves the selection. If the current PageId is deleted, navigation falls back to the page occupying the clamped previous physical position and adopts that page's PageId.

During the short `replaceWorkingCopy(...)` transaction window where PageGraph is intentionally null, canonical navigation IDs are retained. Installing the target PageGraph resolves those IDs to the new positions before dependent state is committed.

Document history snapshots both canonical IDs and compatibility numbers; undo/redo restores PageGraph first and then restores current/selected pages by PageId. Numeric history values remain only as a legacy/fallback path.

The older organizer `PageStore` already uses PageIds for its internal selection model. This slice aligns canonical DocumentSession navigation with the same stable identity model without requiring a UI redesign.


### Real PDF /PageLabels read path

PDF Hub now reads logical page labels during PDF admission from PDF.js `getPageLabels()`, using the renderer document that is already leased/cached for page metrics.

PDF.js owns parsing of the PDF `/PageLabels` number tree and standard label semantics:
- `/D` decimal
- `/r` lower Roman
- `/R` upper Roman
- `/a` lower alphabetic
- `/A` upper alphabetic
- `/P` prefix
- `/St` starting number/restart

PDF Hub validates that the resolved label array matches the physical page count. Missing, malformed, rejected, or inconsistent label metadata fails soft to ordinary physical page-number presentation; document admission itself is not rejected.

Resolved values are stored on `PageNode.logicalLabel`. They are **not stable page identity**. A PDF PageLabels number tree is defined over physical page indices/ranges.

### Canonical PageLabel ranges and writer

PDF Hub now has a canonical logical-label configuration on PageGraph:

```ts
interface PageLabelRange {
  startPageId: PageId
  style?: 'decimal' | 'roman-lower' | 'roman-upper' | 'letters-lower' | 'letters-upper'
  prefix?: string
  startNumber?: number
}
```

The range start uses stable PageId in application state. The PDF writer resolves each start PageId to its current physical index and emits a real catalog `/PageLabels` number tree with `/Nums`, `/S`, `/P`, and `/St`.

The canonical `SET_PAGE_LABELS` command carries the complete range configuration. An empty range list removes only the catalog `/PageLabels` entry. Because PageLabel configuration lives inside PageGraph, normal document history snapshots it with the corresponding PDF byte revision; undo/redo therefore restores logical labels and serialized bytes together.

Structural semantics for canonical ranges:
- rotate/replace preserve ranges because physical order/count is unchanged
- reorder keeps surviving range-start PageIds and recomputes resolved labels in the new physical order
- insert/blank/duplicate/merge keep range starts; inserted pages inherit the active surrounding range
- delete/split migrate a deleted range start to the first surviving page that originally belonged to that range; a fully deleted range disappears
- every order/count mutation with label metadata rewrites the serialized `/PageLabels` tree before commit
- if an existing imported PDF exposes only resolved labels and no canonical range structure, the first order/count mutation removes the stale serialized PageLabels entry rather than inventing unrecoverable range semantics
- reopening a PDF always re-reads the serialized resolved labels through PDF.js

Logical PageLabels remain separate from visible printed page numbers/header-footer content. Setting PageLabels must never draw page content.

The current mutation path may perform an additional pdf-lib parse to rewrite PageLabels after a structural operation. Phase 7's persistent mutation-session work is the planned place to remove this repeated-parse cost rather than expanding 5F into an engine rewrite.


### Page Labels UX

Organize mode exposes one focused **Logical Page Labels** workflow backed exclusively by the canonical `SET_PAGE_LABELS` command.

The control supports:
- restart/apply from the current page
- restart/apply from the first selected page
- decimal, lower/upper Roman, lower/upper alphabetic styles
- optional prefix
- positive starting number
- prefix-only ranges
- preview before commit
- clear logical labels

The UI works with stable PageIds internally. Physical page position remains visible in the dialog, thumbnails, and page navigator; logical labels are secondary metadata. A logical label must never replace the physical page position where the user needs structural context.

On an unlabeled document, adding the first restart after physical page 1 seeds an ordinary decimal range at page 1 so the complete PDF number tree remains valid. Existing later canonical restart ranges are preserved. Reapplying at the same PageId replaces that restart.

For imported PDFs where PDF.js can resolve labels but the original compact PageLabel range dictionaries have not been reconstructed, the dialog warns that applying a restart replaces that imported scheme with a canonical PDF Hub configuration.

Page Labels UI never calls the low-level PDF writer directly and never uses header/footer drawing commands. All mutations flow through `SET_PAGE_LABELS → CommandBus → DocumentTransaction`.


### PageLabels Automate and headless API compatibility

PageLabels now has two non-Organize integration surfaces, both using the existing canonical command contract.

**Automate:** Quick Actions includes a task-level Logical Page Labels card. It reuses the same PageLabels dialog as Organize and dispatches `SET_PAGE_LABELS` through `CommandBus` with source `macro-runner`. It is intentionally **not** a new macro DSL operation. The current legacy macro executor can still collapse structural recipes into an opaque `APPLY_WORKING_COPY`, so embedding stable PageId ranges inside that DSL would imply identity guarantees it cannot yet provide.

**Headless/API:** `PDFHubHeadless` now exposes:
- `inspectDocument(bytes)` → documentKey + PageGraph/PageIds for those exact bytes
- `executeCommand(bytes, draft)` → executes the canonical `SET_PAGE_LABELS` draft
- existing `execute(bytes, recipe)` → legacy macro entrypoint, unchanged

The headless command type is an `Extract<PdfCommandDraft, { type: 'SET_PAGE_LABELS' }>`; there is no parallel PageLabels request model. The API and session dispatch share `executePageLabelCommandMutation`, which owns PageLabel domain validation, derived PageGraph labels, and the PDF writer call.

Headless PageIds are derived during inspection from the exact source-byte document hash. After a successful mutation the PDF bytes/documentKey change, so integrations must inspect the new bytes again before constructing another PageId-anchored command.

This is a narrow integration bridge, not the final public SDK. The later SDK phase should generalize the same canonical command/session model rather than layering a second API contract over it.


## Mutation engine migration

Phase 7 is introducing an engine-neutral `PdfMutationEngine` beneath canonical
commands and document transactions.

The first Phase 7A implementation is
`PdfLibMutationEngine`, which opens a transaction-local
`PdfMutationSession`. The session owns one parsed PDF revision and exposes
engine-neutral page count, page metrics, rotation and commit operations.

`ROTATE_PAGES`, canonical structural/donor page mutations, logical PageLabels,
simple text overlays, visual masks, and professional header/footer PDF writes
now execute through this boundary. Donor/image resources remain out-of-band.
Stable PageId PageLabel ranges, header/footer selectors/tokens/layout
resolution, and simple text token expansion remain in core; the engine receives
resolved physical PageLabel/text/mask/header-footer write operations.
PageGraph, admission, annotation, Writer, OCR and history semantics remain in
core command/transaction code.

Canonical mutation-session commits now carry authoritative before/after page
counts into the document transaction, eliminating its redundant count-only
reparses for those commands. The transaction validates the metadata against
the active session/PageGraph. Compatibility/non-session commits retain the
parse-based fallback when metadata is unavailable.

Reorder/delete/duplicate currently preserve the prior pdf-lib page-copy rebuild
semantics. Phase 7 is an execution-boundary migration, not the later fidelity
hardening phase.

This is intentionally not yet the Phase 8 large-document substrate:
`DocumentSession` still stores `Uint8Array` revisions, and OPFS /
`DocumentSource` / checkpoint history remain future work.

See `Docs/PDF_MUTATION_ENGINE.md` and issue #211.


### Phase 7D.1 content writes

Canonical PageLabels, simple text overlays and visual masks now reuse the
active `PdfMutationSession`. Structural PageLabels are applied before the
session's single save rather than reopening committed bytes in a separate
writer. Phase 7D.2 also moved professional header/footer writes into the same
session boundary; Phase 7E then removed transaction-only count reparses for
canonical session commits.


### Phase 7D.2 professional header/footer writes

Professional header/footer selectors, tokens, PageLabel/section semantics and
resource preflight remain in the Phase 6 domain. Canonical command dispatch now
compiles the resolved result to an engine-neutral physical write plan and calls
`PdfMutationSession.applyHeaderFooter(...)`; it no longer opens a separate
pdf-lib document through the compatibility writer. Legacy direct/headless
compatibility callers may still use `executeHeaderFooterTemplateMutation(...)`.


### Phase 7E revision metadata

`PdfMutationSession.commit()` already returns the authoritative output page
count. Canonical session-backed commands now propagate that result, together
with the active pre-mutation page count, into `commitDocumentMutation(...)`.
The transaction validates the metadata against session/PageGraph state and
uses it for history, OCR page-count policy and session commit without reparsing
the before/after PDF bytes solely to count pages.

Compatibility/non-session byte-replacement paths keep a guarded
`PdfEditAdapter.countPages(...)` fallback. Whole-byte history remains
unchanged; this is not the Phase 8 OPFS/checkpoint-history migration.


### Phase 8A/8B DocumentSource and admission boundary

The core `DocumentSource` contract now defines exact random byte-range access
with typed bounds/read errors and caller-owned read results. Concrete
`MemorySource` and `BrowserFileSource` implementations live under the
adapter boundary; the browser adapter materializes only the requested
`Blob.slice(...)` range.

Primary admission now retains the original source out-of-band and stores only
its `sourceId` in `DocumentSession`. Current PageGraph/render/mutation/history
consumers still use one compatibility-materialized `Uint8Array`; file/OPFS-
backed working revisions remain the next migration slice.
