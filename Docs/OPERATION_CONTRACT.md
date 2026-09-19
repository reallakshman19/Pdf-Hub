# PDF Hub Operation Contract

Status: **authoritative for the current local-first editor architecture**.

This contract defines how document mutations enter PDF Hub and how undo/redo is recorded. Historical plans describing a second command registry/store, server-first execution, or subsystem-local PDF history are not authoritative.

## Canonical mutation flow

```text
Desktop UI ─┐
Mobile UI ──┤
Automate ───┤
Future SDK ─┼──> PdfCommand
Future Agent┘        |
                     v
              CommandBus.execute()
                     |
                     v
              dispatchCommand()
                     |
                     v
             DocumentTransaction
                     |
                     v
               DocumentSession
                     |
                     v
                  PDF engine
```

`dispatchCommand()` is an internal dispatcher. Product surfaces must enter through `CommandBus.execute()` for covered document mutations.

## Command invariants

A canonical `PdfCommand` is JSON-serializable and contains:
- stable command ID
- operation type
- source
- risk classification
- creation timestamp
- document key
- serializable payload
- optional group ID

Binary PDF bytes and donor capabilities are **not** stored inside commands. They are supplied out-of-band through execution resources.

## Transaction invariants

A document transaction is the user-visible undo unit.

For structural operations it captures the coherent before/after state required to restore:
- working PDF bytes/revision
- document key
- page count
- PageGraph / stable PageIds
- current page
- selected pages
- annotations/review-backed annotation state
- Writer V2 overlay state

PageGraph mutation and page remapping of annotations and Writer elements belong to the same transaction as the page operation. Undo/redo must restore the corresponding PageGraph snapshot together with the byte revision.

Automate/macros commit as one canonical transaction when the workflow produces one document commit.

## Chronological history

PDF-backed editing uses one chronological document history.

```text
add annotation
add Writer element
rotate pages
run Automate workflow
```

Undo reverses those operations in exact reverse chronological order, regardless of which UI mode created them.

Annotation-local document undo/history is retired.

Writer V2 local undo/redo is allowed only for `blankDocument` authoring. PDF-overlay Writer mutations emit `WRITER_CHANGE` transactions into document history and do not retain a second local undo stack.

Lexical in-editor undo while actively editing rich text remains an editor-level concern; committed Writer object mutations enter document history.

## Restore ordering

Undo/redo runs through the document-operation queue. A history move must not race another document mutation.

Before moving a history pointer, persistence required for the target state must succeed. If persistence fails, the history stack remains unchanged.

Restoring a transaction restores dependent annotation and Writer state with document state.

## Save/export separation

History semantics do not change the save contract:
- **Save / Save As** preserve supported editable native annotations.
- **Export Flattened** burns visual markup into page content.
- **Searchable PDF export** is a separate OCR output path.

## Forbidden architecture

Do not reintroduce:
- `CommandStore`
- a command registry as a second execution system
- command-local history separate from document history
- annotation `history/future/undo/redo` stacks for PDF-backed editing
- direct product imports of `core/commands/dispatch`
- PDF-overlay Writer undo as an independent timeline

The Phase 4 architecture audit enforces these boundaries.

## Future phases

Stable `PageId`, PageGraph, PageLabels, large-file sources, mutation-engine abstraction, and the public SDK must build on this command/transaction contract rather than creating parallel mutation paths.

Annotation/review page identity uses stable `PageId`. `pageNumber` is a derived one-based position for rendering/navigation and compatibility with native PDF page arrays; structural commands must not use it as durable identity.

PDF-overlay Writer elements use stable `PageId` as page identity; `pageIndex` is derived for rendering/export. Blank Writer documents are not part of the PDF PageGraph and retain their independent page-index semantics.

OCR page-scoped state uses stable `PageId` as PDF page identity. `pageIndex` is derived for OCR execution/rendering. Structural PDF transactions must reanchor or invalidate OCR coherently and undo/redo must restore the OCR snapshot that belongs to the corresponding byte/PageGraph revision.

Session current-page and selected-page identity use stable `PageId`. Numeric `currentPage` and `selectedPages` values are derived UI/engine compatibility coordinates. Structural transactions and history must preserve PageIds across reorder/insert operations and resolve numeric positions from the target PageGraph.

PDF `/PageLabels` are logical presentation metadata over physical page ranges, not PageId identity and not visible printed page-number content. Canonical PageLabel ranges use `startPageId` in application state; serialization resolves those anchors to current physical indices. Any structural operation that changes page order/count and has PageLabel metadata must rewrite or remove the underlying `/PageLabels` number tree in the same document transaction. `SET_PAGE_LABELS` is the canonical command boundary; no UI, Automate, or SDK path may write PageLabels directly.

Page-label UI may display a logical label beside a physical page number, but must not substitute logical labels for structural page position. UI mutations must dispatch `SET_PAGE_LABELS`; direct imports of the PageLabels PDF writer from UI components are prohibited.

Automate PageLabels is a direct canonical-command task, not a legacy macro DSL step. Headless integrations must inspect exact source bytes to obtain PageIds, then submit the canonical `SET_PAGE_LABELS` draft through the shared PageLabels command executor; they must re-inspect mutated bytes before issuing another PageId-anchored command.
