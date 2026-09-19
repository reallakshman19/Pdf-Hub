# PDF Mutation Engine Contract

Status: **Phase 7E — canonical mutation-session commits carry authoritative revision metadata into document transactions**.

Tracking issue: #211.

## Purpose

The mutation engine is the PDF-byte execution boundary below canonical commands
and document transactions.

It does **not** own product state such as PageGraph, annotations, Writer, OCR,
selection, history, logical labels, or workflow semantics.

```text
UI / Mobile / Automate / SDK / Agent
                  |
                  v
              CommandBus
                  |
                  v
         DocumentTransaction
                  |
                  v
         PdfMutationEngine
                  |
                  v
        PdfMutationSession
                  |
                  v
           engine adapter
```

## Engine-neutral contract

`core/pdf-mutation/types.ts` defines:

- `PdfMutationEngine.open(...)`
- `PdfMutationSession.pageCount`
- `PdfMutationSession.getPageMetrics(...)`
- `PdfMutationSession.rotatePages(...)`
- `PdfMutationSession.reorderPages(...)`
- `PdfMutationSession.removePages(...)`
- `PdfMutationSession.insertBlankPage(...)`
- `PdfMutationSession.duplicatePages(...)`
- `PdfMutationSession.insertPdf(...)`
- `PdfMutationSession.replacePage(...)`
- `PdfMutationSession.appendPdfs(...)`
- `PdfMutationSession.setPageLabels(...)`
- `PdfMutationSession.drawText(...)`
- `PdfMutationSession.drawVisualMasks(...)`
- `PdfMutationSession.applyHeaderFooter(...)`
- `PdfMutationSession.commit()`
- `PdfMutationSession.dispose()`

No pdf-lib object or type crosses this boundary.

The first implementation is
`adapters/pdf-mutation/PdfLibMutationEngine.ts`.

## Session lifecycle

A mutation session owns one parsed active-document revision.

```text
bytes
  |
  v
open() ----> parsed PDF
               |
               +--> pageCount
               +--> getPageMetrics()
               +--> rotatePages()
               +--> reorderPages()
               +--> removePages()
               +--> insertBlankPage()
               +--> duplicatePages()
               +--> insertPdf(donorBytes)
               +--> replacePage(donorBytes)
               +--> appendPdfs(donorBytes[])
               +--> setPageLabels(entries)
               +--> drawText(resolved operations)
               +--> drawVisualMasks(operations)
               +--> applyHeaderFooter(resolved plan)
               |
               v
             commit()
               |
               v
          revision bytes
```

Rules:

1. The active PDF is parsed once when the session opens.
2. Read helpers and mutations reuse that parsed document.
3. `commit()` saves the current session revision once.
4. A committed or disposed session fails closed for later reads/mutations.
5. Cancellation is checked at open, mutation and commit boundaries.
6. A session is transaction-local and must not be shared between concurrent
   commands.

## Phase 7A migration

`ROTATE_PAGES` is the first canonical command migrated to this boundary.

The command still owns:

- PageId/PageGraph semantics
- annotation geometry remapping
- Writer geometry remapping
- OCR transaction behavior
- history / rollback
- document revision identity

The engine session owns only:

- parsed PDF state
- page count
- page metrics
- PDF page rotation
- save/commit

Rotation now obtains page metrics from the same parsed mutation session used to
perform the PDF rotation.

The legacy macro `rotate_pages` operation still calls `PdfEditAdapter` in
7A. That compatibility path is outside this narrow slice and will be migrated
when macro execution is compiled into the shared mutation lifecycle.

## Explicitly out of scope for 7A

- reorder/delete/insert/duplicate
- donor insert/replace/merge
- PageLabels writer migration
- header/footer writer migration
- OPFS / DocumentSource
- checkpoint or delta history
- worker transport
- alternate/WASM mutation engines

Those are later Phase 7/8 slices.

## Performance invariant

For one canonical rotate command affecting N pages:

- one `PDFDocument.load()` opens the active mutation session
- page count and page metrics reuse that parsed document
- all N rotations reuse that parsed document
- one `save()` commits the revision

The focused engine test asserts this single-parse behavior.


## Phase 7B structural migration

The following canonical commands now open a transaction-local mutation session
for the active PDF revision:

- `REORDER_PAGES`
- `REORDER_PAGES_BY_ORDER`
- `DELETE_PAGES`
- `INSERT_BLANK_PAGE`
- `DUPLICATE_PAGES`

They reuse the active parsed document for the PDF mutation itself. PageGraph,
PageLabel-range reanchoring, annotation/Writer/OCR anchoring, selection and
history remain in core command/transaction code.

`SPLIT_PAGES` is deliberately not included in 7B because it combines an
artifact-producing extraction with mutation. It still uses the legacy
`PdfEditAdapter.removePages` path and will move in a later slice.

Donor-backed `INSERT_PAGES`, `REPLACE_PAGE`, and `MERGE_PDF` remain 7C.

### Fidelity behavior is intentionally unchanged

For reorder/delete/duplicate, `PdfLibMutationEngine` currently rebuilds a
page-only output document using pdf-lib `copyPages`, matching the previous
`PdfEditAdapter` behavior. Phase 7 changes the mutation-session boundary; it
does **not** claim to fix document-level fidelity for outlines, forms,
attachments, tagging, signatures, or other catalog structures.

Those fidelity limits remain explicit Phase 9 work.

### Parse-count scope

As of Phase 7E, canonical commands whose output comes from a
`PdfMutationSession.commit()` carry the session's authoritative
`beforePageCount` and `afterPageCount` into `commitDocumentMutation(...)`.
The transaction validates that metadata against the active session/PageGraph
and does not call `PdfEditAdapter.countPages(...)` for those revisions.

Compatibility/non-session transaction callers still use the parse-based count
fallback when revision metadata is unavailable. Donor admission and PDF.js
PageGraph construction also retain their independent validation/rendering
parses.


## Phase 7C donor-backed migration

The canonical donor-backed page commands now use the same active-document
mutation session:

- `INSERT_PAGES` → `session.insertPdf(...)`
- `REPLACE_PAGE` → `session.replacePage(...)`
- `MERGE_PDF` → `session.appendPdfs(...)`

The command model remains unchanged. Commands carry donor **resource IDs** only.
Actual donor bytes remain inside the existing admitted donor-resource boundary
and are resolved out-of-band immediately before execution.

Admission semantics are preserved:

1. donor metadata/bytes are admitted and bound to the active document context
2. dispatch inspects the admitted resource
3. PageGraph information is derived for product-state planning
4. the donor is consumed exactly once
5. only the resolved `Uint8Array` crosses into `PdfMutationSession`
6. filenames, handles, admission objects and donor registry state never enter
   the mutation-engine contract or command/history record

### Parse scope for donor commands

Inside the **mutation adapter**, the active PDF revision is loaded once when
its session opens and each consumed donor is loaded once for page copying.

A focused engine test performs insert + merge + replace in one active session
and asserts four adapter-level `PDFDocument.load()` calls: one active-document
parse plus three donor parses. The active revision is never reparsed between
those mutations.

This is not the total donor-pipeline parse count. Before command execution,
the current admission boundary still validates donor page count through
`PdfEditAdapter.countPages(...)`, and donor PageGraph construction later uses
PDF.js. Phase 7C deliberately leaves those validation/rendering parses in
place; it only removes reparsing of the active PDF inside the donor mutation
helper itself.

Phase 7E removes the transaction-level before/after count reparses for the
canonical mutation-session path. Donor admission and donor PageGraph parsing
remain separate concerns.

### Fidelity behavior

Insert/merge use pdf-lib page copying into the active parsed document, matching
the previous adapter behavior. Replace retains the previous page-only rebuild
semantics. Phase 7C therefore does not claim improved document-level fidelity.


## Phase 7D.1 content mutation migration

Three more canonical write paths now execute inside the active mutation session:

- logical PDF `/PageLabels`
- simple text overlays from `DRAW_TEXT_ON_PAGES`
- visual masks from `DRAW_REDACTION_BOX`

The mutation contract receives **resolved physical write operations**, not
product-domain intent.

For PageLabels, core converts stable `PageId` ranges into physical
`startPageIndex` entries. The pdf-lib adapter only serializes the number tree.
Structural page commands now reanchor PageLabel ranges in core, apply the
resulting entries to the same parsed PDF session, and then save once. This
removes the previous post-commit `writePdfPageLabels(...)` reopen/save cycle.

`SPLIT_PAGES` is also partially migrated: extraction remains the
artifact-producing `PdfEditAdapter.extractPages(...)` helper, while removal
of pages from the working document and PageLabel reconciliation now occur in
the persistent mutation session.

For simple text overlays, legacy `{page}`, `{pages}`, `{file}`, and
`{date}` token expansion stays in core. The engine receives one already
resolved text operation per page. It owns font embedding, text measurement,
alignment, color conversion, rotation, and PDF drawing.

For visual masks, the engine receives explicit page index and rectangle
geometry. The user-visible semantics remain unchanged: this is a visual mask,
not secure content redaction.

### Remaining 7D work

The professional header/footer template path is intentionally still outside
the mutation session in 7D.1. Its selector/token/layout resolution belongs in
the header/footer domain. Phase 7D.2 will move only the already-resolved
header/footer PDF write plan into the mutation session.

The legacy standalone `writePdfPageLabels(...)` utility remains for direct
utility tests and compatibility callers, but canonical command dispatch no
longer reopens the PDF through it.

Phase 7E now propagates the mutation session's authoritative before/after page
counts into the transaction, so this canonical path does not reparse either
revision solely to count pages.


## Phase 7D.2 professional header/footer migration

The canonical `APPLY_HEADER_FOOTER_TEMPLATE` command now uses the persistent
mutation session for its PDF write.

The existing Phase 6 domain remains authoritative for:

- template validation
- PageId/range/parity selection
- logical PageLabel/section semantics
- metadata/variable/date/time token resolution
- cascade/override rules
- binary resource preflight

`prepareHeaderFooterTemplateMutation(...)` performs that work without reading
or mutating PDF bytes. It then compiles the resolved pages into the
engine-neutral `PdfMutationHeaderFooterPage` plan:

- one zero-based physical `pageIndex`
- explicit page margins/offsets
- already-resolved text or image content
- explicit font/style/color/opacity data
- explicit separator data
- out-of-band image resource IDs

PageId, logical labels, section counters, template selectors and token syntax
do not cross into `PdfMutationSession`.

The pdf-lib page geometry, font/image resource preparation and actual drawing
logic are still shared with the Phase 6 compatibility writer. The loaded-
document helper `applyPdfLibHeaderFooterPlan(...)` accepts an already parsed
PDF document, so canonical dispatch no longer performs a second
`PDFDocument.load() -> render -> save` cycle for professional headers and
footers.

The compatibility `executeHeaderFooterTemplateMutation(...)` and
`pdfLibHeaderFooterWriter` remain for legacy macro/headless/direct utility
callers. Canonical CommandBus dispatch does not use them.

Phase 7E now carries authoritative mutation-session page-count metadata across
the transaction boundary. Compatibility/non-session commits retain the old
parse-based fallback when no authoritative revision metadata exists.


## Phase 7E transaction revision metadata

`commitDocumentMutation(...)` now accepts optional
`DocumentMutationRevisionMetadata`:

- `beforePageCount`
- `afterPageCount`

Canonical mutation-session commands never synthesize these values from the
output bytes. `applyCommittedSessionMutation(...)` receives the active
session's pre-mutation page count and the `PdfMutationCommitResult.pageCount`
returned by the engine, then passes both values into the transaction.

The transaction fast path validates:

1. both values are positive integers;
2. `beforePageCount` matches the active session page count;
3. when an active PageGraph exists, `beforePageCount` matches its page count;
4. the existing target-PageGraph check still validates `afterPageCount`.

If any check fails, the transaction fails in the `prepare` stage before
annotation persistence or in-memory store mutation.

When metadata is present, transaction prepare performs the revision hash but
does **not** call `PdfEditAdapter.countPages(...)` for either PDF revision.

When metadata is absent, the existing two-count parse fallback remains. This is
required for compatibility/non-session byte replacement paths such as
`APPLY_WORKING_COPY`.

### Resulting parse scope

For a canonical mutation-session command, the active revision is parsed by the
mutation engine once, mutated, saved once, and committed to application state
without a second pair of transaction-only page-count parses.

This does not imply a one-parse product pipeline in every case. Donor
admission, donor PageGraph construction, artifact extraction, PDF.js rendering,
and compatibility/headless flows may have independent parses for their own
purposes.

Phase 7E does not change history storage: history still retains whole-PDF byte
snapshots under the existing byte budget. OPFS/checkpoint history remains
Phase 8 work.
