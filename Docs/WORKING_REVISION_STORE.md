# Working Revision Store

Status: **Phase 8C.1 — storage boundary and adapters**.

Tracking: #218, #221.

## Purpose

Phase 8A/8B separated the immutable original PDF source from the current
materialized session bytes. Phase 8C introduces a second boundary for working
PDF revisions so later session, renderer and history migrations can stop
retaining every active revision in the JavaScript heap.

The engine-neutral contract is:

```ts
interface WorkingRevisionStore {
  readonly id: string
  readonly kind: 'memory' | 'opfs'
  readonly capabilities: RevisionStoreCapabilities

  commit(input: CommitRevisionInput): Promise<StoredRevision>
  open(revisionId: string): Promise<DocumentSource>
  has(revisionId: string): Promise<boolean>
  remove(revisionId: string): Promise<void>
  clear(): Promise<void>
}
```

No React, Zustand, PDF.js, pdf-lib, CommandBus or DocumentSession type crosses
this boundary.

## Immutable revision identity

A committed revision id names fixed bytes.

Changing the working document does **not** overwrite a committed revision.
Instead the caller creates a new revision id, commits all bytes, validates the
commit, and only then changes the active revision pointer.

This rule is required for safe undo/redo, recovery checkpoints and concurrent
rendering:

```text
revision A (immutable)
    |
command
    v
revision B (commit completely)
    |
active pointer switches A -> B
```

A failed or cancelled commit must leave the previous active revision intact and
must not expose a partially written new revision.

## MemoryRevisionStore

`MemoryRevisionStore` is the compatibility fallback.

It materializes a `DocumentSource` into private bytes and publishes the
revision only after the full materialization succeeds. It is:

- random access
- atomic at the store boundary
- non-persistent
- appropriate for unsupported browsers, tests and bounded/small documents

It is not the target substrate for very large PDFs.

## OpfsRevisionStore

`OpfsRevisionStore` stores immutable PDF revisions in the browser Origin
Private File System.

Properties:

- source bytes are copied in bounded chunks
- cancellation is checked during the copy
- a pending revision is invisible through `has()` and `open()`
- close + size verification complete before publication
- failed/cancelled commits best-effort abort and remove the unpublished file
- existing revision ids cannot be overwritten
- each store id gets an isolated OPFS subdirectory
- committed revisions reopen through `OpfsSource`, which implements the same
  random-access `DocumentSource` contract
- an unexpected backing-file size change fails closed

The injected-directory constructor exists for testing. Normal browser creation
uses `navigator.storage.getDirectory()`.

## Lifecycle

The store owns working revision files, not the immutable original user File.

Later phases will define retention around active revision, history checkpoints
and crash recovery. Phase 8C.1 deliberately provides only explicit
`remove(...)` and `clear()`; it does not guess when history or recovery no
longer needs a revision.

## Deliberately unchanged in 8C.1

The product still uses compatibility session bytes:

- `DocumentSession.originalBytes`
- `DocumentSession.workingBytes`
- PDF.js still receives materialized bytes
- `PdfMutationEngine` still opens from bytes
- history still retains whole-PDF snapshots
- the 100 MB primary-open policy remains

This slice establishes and certifies the storage contract without changing user
behavior.

## Phase 8C.2

The next slice should migrate the active working revision lifecycle:

1. choose OPFS when available, otherwise MemoryRevisionStore
2. commit admitted working bytes as an initial revision
3. store active/original revision ids in DocumentSession
4. retain compatibility bytes only for consumers not yet migrated
5. make document mutations commit a new revision before switching session state
6. define cleanup rules for superseded non-history revisions

Phase 8D can then let PDF.js consume revision `DocumentSource` ranges, and
Phase 8E can move history from full-byte snapshots to revision references,
journals and bounded checkpoints.
