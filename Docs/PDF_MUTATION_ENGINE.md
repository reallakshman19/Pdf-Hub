# PDF Mutation Engine Contract

Status: **Phase 7A — contract and rotation proof**.

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
