# PDF Mutation Engine Contract

Status: **Phase 7D.1 — canonical page mutation, PageLabels, text overlays, and visual masks on persistent mutation sessions**.

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

The single-parse invariant in Phase 7A/7B applies to the **mutation session**.
The current `commitDocumentMutation(...)` prepare stage still validates
before/after page counts by calling `PdfEditAdapter.countPages(...)` on both
byte revisions. Therefore a complete command transaction still performs
additional parses today.

Removing those transaction-level count reparses and carrying authoritative
session revision metadata into the commit boundary is planned for Phase 7E.
Do not describe Phase 7B as a one-parse end-to-end transaction.


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

The transaction prepare caveat from 7B remains: `commitDocumentMutation(...)`
still reparses before/after revision bytes for page-count validation. That is
Phase 7E work.

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

The Phase 7E transaction caveat remains: `commitDocumentMutation(...)`
still reparses before/after revision bytes for page-count validation.
