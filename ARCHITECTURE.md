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
- revision-aware in-memory history now retains immutable revision locators instead of whole-PDF byte snapshots, but legacy/no-revision history still retains inline bytes and durable journal/checkpoint metadata is not implemented yet;
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

Phase 8D.3 migrates the remaining active renderer consumers onto the same
revision-keyed lease path. Uncached Search, native Bookmarks/outline loading,
and active Select Box Copy now acquire the active revision through an explicit
session-snapshot coordinator. Search operates on the leased
`PDFDocumentProxy`; Select Box text/image helpers expose loaded-document
operations while retaining their explicit-byte wrappers for standalone callers.
All short-lived active leases are released in `finally`, and cancellation is
propagated through source/page/render work.

Session `originalBytes`/`workingBytes`, mutation-engine input and Save
composition remain materialized.

Phase 8E.1 begins history migration without introducing replay or revision
deletion. Revision-aware history states retain
`revisionStoreId + activeRevisionId` as an immutable revision locator and do
not retain PDF byte snapshots. Legacy/no-revision sessions keep inline byte
snapshots for compatibility. Undo/redo resolves and materializes only the
target revision before persistence or history-stack movement, then restores the
existing PageGraph/navigation/annotation/Writer/OCR state. Missing or
mismatched revision storage fails closed before an undo/redo entry is consumed.

Phase 8E.2 adds the replayability/checkpoint-barrier policy before any
durable replay journal exists. Canonical commands are classified as
`SELF_CONTAINED_REPLAY`, `CHECKPOINT_REQUIRED` or `NON_MUTATING`.
Donor-backed insert/replace/merge, opaque working-copy application,
annotation/Writer descriptive state commands, image-bearing header/footer
templates, commands that actually depend on runtime file-name/locale context,
and split operations with artifact side effects require checkpoints.
`EXTRACT_PAGES` is explicitly non-mutating and is not a reconstruction-journal
entry; `SPLIT_PAGES` is mutating and therefore cannot be treated as artifact-only.

Phase 8E.2 introduced this classification as policy only. Phase 8E.5C2 now
consumes the same policy for headless recovery replay; commands are reclassified
at recovery-plan time so persisted disposition metadata cannot override current
barrier policy.

Phase 8E.3 adds the durable journal-manifest substrate. Each admitted
revision-aware document receives a stable `historyJournalId` distinct from the
changing `documentKey`. After the initial immutable working revision is
published, admission creates a versioned journal manifest with an `ADMISSION`
checkpoint that references that revision. Journal metadata contains revision
references and future replay/checkpoint metadata only; it must not contain PDF
byte snapshots. Browser persistence prefers IndexedDB and falls back to memory,
with the session recording whether the journal store is actually persistent.
Stale/superseded admission removes its provisional journal manifest before
returning.

Phase 8E.4 appends durable metadata for canonical binary document mutations.
The same transaction id is used by in-memory history and the journal entry.
`SELF_CONTAINED_REPLAY` mutations append an entry only;
`CHECKPOINT_REQUIRED` mutations append the entry plus a `BARRIER` checkpoint
at the immutable after-revision. Undo/redo moves the manifest's active revision
under the same rollback discipline as session/history state. If a new mutation
is made after undo, the abandoned journal redo tail is truncated before the new
branch is appended. Journal manifest replacement is required to be atomic; a
failed durable save rolls session, annotation, Writer, OCR and in-memory history
back to the pre-operation snapshot.

Phase 8E.5A defines that state-checkpoint design without wiring it into
the synchronous state transaction path yet. A versioned `statePayload` may be
attached to `BARRIER` or `PERIODIC` journal checkpoints. The payload contains
annotation state plus Writer history state, but its codec rejects inline data
URIs, typed binary data, Blob/File objects, non-finite numbers, cycles,
symbol-keyed data, non-plain objects and other JSON-unsafe values. Writer image
elements remain safe because history carries only asset ids; binary Writer
assets continue to live in the Writer persistence subsystem. Custom annotation
stamps with inline `stampImageDataUrl` cannot be journal-checkpointed until
their binary is externalized.

Before state-only durability can be wired, Phase 8E.5B1 adds a durable
logical transaction cursor independent of `activeRevisionId`. This is required
because annotation/Writer transactions can share the same immutable PDF
revision. New manifests start at `activeTransactionId: null`; binary mutation
append advances the cursor; undo/redo validates and moves the cursor by
transaction identity; divergent edits truncate from the cursor rather than
from revision identity. Pre-8E.5B1 manifests without cursor metadata remain
readable by inferring the cursor from their active binary revision.

Phase 8E.5B2 introduces that async durability coordinator without yet
migrating annotation/Writer store entrypoints. The coordinator runs through the
document operation queue, builds the exact same `HistoryState` shape as the
legacy synchronous recorder, prepares a same-revision journal entry plus
binary-safe `BARRIER` state checkpoint, verifies both session identity and the
in-memory/journal history cursor, invokes a caller-supplied apply callback,
pushes in-memory history, then atomically saves the updated journal manifest.
Any failure after apply invokes caller rollback and restores the prior history
stack. Unsafe state payloads fail before apply.

Phase 8E.5B3A adds a lazy mutation factory evaluated inside the same
document-operation queue. This prevents rapid UI edits from precomputing
multiple state snapshots against the same stale store state before the first
durable transaction applies. The compatibility prebuilt-input API remains
available and both public APIs execute through one non-enqueuing transaction
core. Rollback now restores the captured session snapshot as well as caller
state and history, so optimistic dirty flags cannot leak after journal failure.

Phase 8E.5B3B migrates PDF-backed annotation mutations onto that lazy
durability path. Journal-aware annotation edits derive their before/after state
inside the document-operation queue, preflight the binary-safe state checkpoint,
apply only after durable metadata preparation succeeds, then persist the journal
after the matching in-memory history transaction is pushed. A journal-save
failure restores annotation state, selection/active state, session dirty state
and history. Rapid queued edits therefore derive from the latest committed
annotation state. Selection, copy and hydration operations remain synchronous,
and legacy/no-journal sessions retain their existing synchronous mutation path.

Selection-dependent queued actions freeze the user's target ids or clipboard at
invocation time so a later selection change cannot reinterpret an already
requested action. Annotation command ids are derived from the actual before/after
state diff, including deletions, rather than from whatever selection happens to
be live when the queue reaches the edit. The durable annotation path depends on
revision/journal identity, not compatibility PDF bytes.

Phase 8E.5B3C1 adds an explicit async
`dispatchWriterCommandDurable(...)` primitive for journal-aware PDF-overlay
mutations. It derives the Writer command result lazily inside the same serialized
document-operation queue, normalizes PageId anchors against the current
PageGraph, clears Writer-local undo/redo, constructs canonical
`WRITER_CHANGE` before/after state, applies only after state-checkpoint
preflight, and returns the actual committed `WriterV2CommandResult`. Durable
failure rolls Writer state back through the shared coordinator. Revision-backed
Writer undo ownership no longer depends on compatibility `workingBytes`.

Phase 8E.5B3C2A begins caller migration with the Writer helpers that already
have async contracts. Rich-text creation, rich-box style updates, single/bulk
rich-box fit updates and async image replacement now await
`dispatchWriterCommandDurable(...)`, so their success result reflects an
actually persisted journal checkpoint rather than a speculative mutation.
Image replacement removes its newly admitted asset and restores its prior dirty
flag when durable Writer dispatch rejects or produces no change. A production
source allowlist limits durable dispatch callers to this tranche.

Phase 8E.5B3C1.1 closes a resource-ordering gap discovered before
image-bearing UI migration. Writer history checkpoints intentionally contain
asset ids rather than inline image bytes, while Writer asset persistence had
previously depended on a 400 ms React autosave. The Writer autosave hook and
history path now resolve one shared runtime persistence adapter. During durable
Writer dispatch, asset ids newly referenced by the command's after-state are
resolved to asset records and persisted before the lazy state-transaction
factory returns journal input. Missing asset records fail closed before Writer
state is applied. Saving prerequisite assets does not mark the Writer document
persisted. If the later journal save fails, an unreferenced persisted asset may
remain; that is safe and is future garbage-collection work. A journal
checkpoint is therefore never intentionally committed ahead of a newly
referenced asset record.

Phase 8E.5B3C2B1 migrates one-shot PDF-overlay UI commits without
turning high-frequency input streams into journal amplification. Writer element
move/resize commits execute only on drag end through the durable UI dispatch
boundary; rich-editor save awaits durable UPDATE before closing the editor and
cleans newly admitted in-memory assets if commit fails. Overlay placement awaits
durable ADD before switching back to the select tool. Writer Ribbon image upload
durably links the newly admitted asset to the active Writer element before the
rich-editor image node is inserted. Select Box Writer insertion awaits durable
ADD before it clears the selection panel or reports success, and cleans temporary
image assets on failed/unchanged insertion. The shared UI dispatch helper logs
context + command type before rethrowing durable failures.

Phase 8E.5B3C2B2A adds the first explicit high-frequency
coalescing boundary for Writer table resize. Pointer-down captures the original
column widths or row height. Pointer-move updates only local React preview
coordinates and renders a transient resize guide; canonical Writer state and
history are untouched throughout the drag. Pointer-up derives one final
`UPDATE_WRITER_ELEMENT` command from the captured geometry plus final pointer
position and sends it through the durable UI dispatch boundary. Pointer-cancel
clears the local preview without committing. Table selection activation remains
synchronous.

Phase 8E.5B3C2B2B migrates the Inspector's direct
transform/style/callout controls onto explicit draft/commit semantics. Numeric
inputs retain local draft text and commit on blur/Enter; Escape restores the
canonical value without mutation. Opacity updates local range state during the
gesture and commits only at pointer/key completion. Color controls buffer picker
changes and debounce them into one durable commit. Font and callout-style selects
remain discrete one-change commits. Inspector commits run through a local promise
chain; each queued commit re-reads the latest canonical Writer element before
constructing full nested rect/style/callout patches, preventing rapid edits from
overwriting a prior queued field with stale object state. Selection clearing
remains synchronous.

Phase 8E.5B3C2B2C migrates Writer Table Properties onto the same
coalesced durable-commit discipline. Cell text, padding, border width, column
width and other numeric/text entries keep local draft state and commit on blur
or Enter; Escape restores the canonical value without mutation. Color pickers
buffer local state and debounce repeated picker input into one durable commit.
Discrete alignment/header/row/column/merge/split/normalize actions emit one
durable command per user action. A panel-local promise chain serializes commits;
each builder re-reads the latest canonical Writer elements before constructing
its command, preventing rapid property edits from overwriting prior queued
changes with stale table state. Table cell selection remains local/synchronous
and is not journaled. No synchronous Writer mutation dispatch remains inside
WriterTablePropertiesPanel.

Phase 8E.5B3C2C1 begins the remaining helper/bridge migration with
single-element Writer updates. The Writer store now exposes
`dispatchWriterCommandDurableLatest(factory)`, which evaluates a command
factory inside the serialized document-operation queue against the latest
canonical Writer state. The existing `dispatchWriterCommandDurable(command)`
delegates mutation commands through that primitive. This closes the stale nested
patch gap for helpers that need to merge review, geometry or table state after
other durable Writer mutations may already be queued.

Review metadata, geometry, table-box editing and image-clear helpers now return
async action results and build their UPDATE command from latest canonical state.
A safe helper boundary logs journal failures and converts them to unchanged
action results rather than leaking rejected promises into UI button handlers.
Inspector table cell/column-label and review-assignee text edits use local drafts
with blur/Enter commit and Escape cancellation, while discrete review/table/image
actions invoke the async helper contract. Geometry Quick Panel awaits the durable
helper result before reporting save success/failure. Quick-template review
metadata is also awaited through the latest-state review helper. Image replacement
remains on its existing direct durable path because it owns image admission,
asset-before-journal persistence and temporary-asset cleanup.

Phase 8E.5B3C2C2 migrates batch Writer selection/arrange and clipboard
mutations. A helper action freezes the user's target IDs (or clipboard snapshot)
at invocation time, then evaluates geometry, lock/hidden state and z-order from
the latest canonical Writer state inside the durable document-operation queue.
Duplicate, delete, lock/unlock, hide/show, z-order, nudge, align and distribute
therefore produce one durable Writer command per logical action without stale
render-time geometry. Clipboard copy remains synchronous non-document UI state;
paste snapshots the current clipboard at invocation, builds clones against the
latest document z-order inside the queue, commits one batch add, and advances the
in-memory clipboard only after a successful commit. Selection-only commands such
as SET_ACTIVE_WRITER_ELEMENT, SET_WRITER_SELECTION and CLEAR_WRITER_SELECTION
remain synchronous because they do not mutate the document.

Phase 8E.5B3C2C3 closes the synchronous PDF-overlay Writer mutation
boundary. OCR Writer insertion now awaits `dispatchWriterCommandDurable`;
failed/no-op dispatch reports `commandApplied: false`, the OCR queue is retained,
and connected UI status is updated only after a committed insertion. Legacy
object consolidation now discovers candidates from latest canonical Writer state
inside the durable queue and emits one
`BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS` command that hides all source objects,
adds/selects the rich replacement and creates one undo/history unit. The command
reducer validates every source update and addition before applying anything, so
invalid input cannot partially hide sources.

Public synchronous `dispatchWriterCommand` now rejects document mutations when
the Writer session is backed by an active PDF revision/working copy. Durable
dispatch uses an explicit internal compatibility override when a journal is not
available, preserving legacy/non-journal PDF-overlay operation while keeping
production callers on the durable API. Synchronous selection-only commands remain
allowed. Synchronous mutation remains allowed only in the explicit blank Writer
document insertion surfaces. A repository-wide anti-drift scan enforces this
boundary over active TypeScript/TSX source.

Phase 8E.5C1 upgrades barrier checkpoint state to a recovery-complete v2
application snapshot above its immutable revision reference. The payload carries
PageGraph/navigation, annotations, Writer and OCR state while keeping PDF bytes
and Writer binary assets out of the journal. Legacy v1 payloads remain valid
journal data but are not treated as complete recovery points.

Phase 8E.5C2 adds headless recovery planning, immutable-revision resolution and
atomic restore execution. The planner chooses the latest valid checkpoint by
logical journal cursor position, then includes only a currently
`SELF_CONTAINED_REPLAY` suffix up to the recorded active cursor. Recovery fails
closed across checkpoint barriers, malformed anchors, stale journal data,
missing revisions or missing Writer assets. Before application, the resolver
verifies the original/checkpoint/replay revision chain and materializes exactly
the checkpoint revision. The executor snapshots session, annotation, Writer, OCR
and in-memory history stores, installs the checkpoint, replays the validated
suffix through canonical dispatch in `recovery-replay` mode, verifies every
produced revision against the durable journal, persists the final annotation
state, and restores the full pre-recovery application snapshot on any failure.
Writer asset bytes remain in Writer persistence and are hydrated by durable
asset id. Duplicate-page derived annotation/Writer identities and timestamps are
command-derived so replay does not create new logical objects.

Recovery replay remains headless: no automatic startup recovery UI is enabled in
8E.5C2.

Phase 8E.5C3 bounds recovery replay distance with recovery-complete `PERIODIC`
checkpoints owned by the durable journal core. Cadence is evaluated only when a
durable transaction is appended; there is no timer or UI scheduler. The first
`SELF_CONTAINED_REPLAY` transaction after admission bootstraps a v2 recovery
point because the `ADMISSION` checkpoint contains only the immutable revision
anchor, not application state. After that, a new periodic checkpoint is scheduled
when any default bound is reached: 20 transactions, 256 KiB of serialized journal
entries since the latest recovery-complete checkpoint, or five minutes elapsed
since that checkpoint as observed by the next transaction. A recovery-complete
`BARRIER` or `PERIODIC` checkpoint resets all three bounds.

Checkpoint-required transactions continue to create only their existing
`BARRIER` checkpoint. When a periodic checkpoint is due, the document
transaction attaches the same recovery-complete v2 after-state used by barrier
checkpoints before the atomic journal save, so persistence failure preserves the
existing application/history rollback contract. Undo followed by a divergent edit
truncates abandoned periodic checkpoints together with the abandoned journal
tail. These cadence bounds limit reconstruction work; they are not storage
retention, compaction, revision deletion, or garbage collection policy.

Phase 8E.5C4 makes working-revision deletion reference-aware. The low-level
stores expose only mechanical inventory (`WorkingRevisionStore.listRevisionIds()`
and `HistoryJournalStore.listAll()`); retention semantics live above them in the
document-history revision-GC policy. The mark phase protects the current
session's original/active revision, every in-memory undo/redo locator, every
retained journal original/active/entry/checkpoint revision, and explicit
process-local runtime pins. Because the browser working-revision store is shared
across documents, planning always consumes the complete journal-store inventory,
not only the active journal. A missing referenced revision fails the plan closed.

Sweep execution is serialized through the document-operation queue and
revalidates revision inventory plus the complete reference graph immediately
before deletion. Persistent OPFS collection additionally requires an origin-wide
Web Locks exclusive lease. Primary admission and canonical binary mutation hold
the same revision-store lease from immutable revision publication through journal
publication, preventing a second tab from observing a newly published revision
as orphaned. A persistent session whose journal is non-persistent/unavailable
holds a separate shared GC-blocker lock for its lifetime; collection requests the
exclusive counterpart with `ifAvailable` and aborts instead of deleting such a
session's bytes. Partial removal stops at the first failure and the original plan
is retry-safe only when the missing inventory consists solely of candidates
already deleted by that plan. No age-only deletion, journal/checkpoint pruning,
automatic startup GC or UI-owned GC trigger is part of 8E.5C4.

WP-8E closure certification exercises the complete durable stack as one system:
process-death reconstruction starts from retained revision/journal backing with
fresh process-local registries and restores the recovery-complete checkpoint plus
its validated SELF_CONTAINED_REPLAY suffix. The closure fixture verifies
PageGraph/navigation, annotation, Writer V2 asset-backed state and OCR
page-anchored state after reconstruction, then runs safe revision GC and repeats
the same recovery from the retained graph. A deliberately damaged recovery graph
(missing required immutable revision) must fail before live-state mutation, and
GC must also fail closed rather than compound that damage.

Phase 8F replaces query-triggered whole-document search extraction with one
runtime incremental index keyed by immutable `activeRevisionId + PageId`.
Physical page numbers are never index identity: search results resolve their
current one-based page number from the active PageGraph, so same-revision page
reordering can reuse indexed text safely while a revision change invalidates the
runtime index.

The SearchPanel owns index lifecycle over the existing revision/source-backed
PDF.js document lease. Scheduling is deterministic: current page first, nearby
pages next, explicitly requested pages after that, then the remaining document
in background order. Extraction owns one PDFPageProxy at a time, calls
`cleanup()` immediately, yields between bounded batches, and is abortable when
revision or priority changes. Generation/owner tokens prevent superseded tasks
from publishing stale page text.

Search query/options are evaluated against whatever page subset is already
indexed, so partial hits are visible while indexing continues and query changes
do not re-extract PDF text. Index progress distinguishes partial no-match from a
completed no-match. TopNav only updates the shared query/search surface; it is
not a second search executor. The active SearchPanel path no longer calls the
legacy full-document `searchDocumentTextInDocument(...)` helper, although
explicit byte/document compatibility APIs remain available to standalone
callers.

The first 8F slice intentionally keeps the page-text index process-local rather
than adding persistence prematurely. A new immutable revision clears the active
runtime index. Persisted indexing, if later justified by measurement, must keep
the same revision + PageId identity and fail closed on schema/revision mismatch.

WP-8G owns the large-document performance corpus and certification after 8F is
terminal. Phase 8G keeps search text process-local and publishes active-query
background results through a per-PageId accumulator: a newly indexed page is
matched once with `SearchIndexer.searchPage(...)`, while deliberate query,
option, revision, or PageGraph changes rebuild results from already-extracted
text. The deterministic corpus generator and machine-readable thresholds live
under `frontend/scripts/phase8g-generate-fixtures.mjs` and
`frontend/performance/phase8g-budget-manifest.json`. Range-backed PDF.js
transport metrics remain separate from canonical pdf-lib mutation/save, which
still materializes complete input/output bytes. Runner benchmark results remain
unclaimed until executable exact-head evidence exists.

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
