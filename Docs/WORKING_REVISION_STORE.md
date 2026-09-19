# Working Revision Store

Status: **Phase 8C.2 — primary admission and session revision lifecycle**.

Tracking: #218, #221, #223.

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

Phase 8C.2 now keeps one process-local working-revision store in a runtime
registry. Normal browser selection prefers OPFS and falls back to
`MemoryRevisionStore` when OPFS initialization is unavailable.

Primary PDF admission uses the SHA-256 `documentKey` as the initial immutable
revision id. The revision is committed or reused **before** the session is
committed. Reuse checks stored/incoming byte size, and concurrent publication
of the same store/revision id is coalesced.

`DocumentSession` now records:

- `revisionStoreId`
- `originalRevisionId` — the immutable recovery anchor created at admission
- `activeRevisionId` — the durable revision that matches the current working
  bytes, or `null` when current bytes have not been published

The active revision id is content-addressed and must match `documentKey`.
Legacy/test/import callers may still open byte-only sessions with all three
revision fields null.

Changing compatibility working bytes through `replaceWorkingCopy(...)`
invalidates `activeRevisionId` immediately. The immutable
`originalRevisionId` survives working changes and Save. Clearing the session
releases the process-local store registration but does not delete persistent
OPFS content-addressed revisions; later recovery/history retention policy owns
physical deletion.

## Deliberately unchanged in 8C.2

The product still retains compatibility session bytes:

- `DocumentSession.originalBytes`
- `DocumentSession.workingBytes`
- PDF.js still receives materialized bytes
- `PdfMutationEngine` still opens from bytes
- current canonical mutation transactions do not yet publish their output into
  the WorkingRevisionStore, so mutation byte replacement clears
  `activeRevisionId`
- history still retains whole-PDF snapshots
- the 100 MB primary-open policy remains

The legacy `originalBytes` field still follows old Save-baseline semantics;
`originalRevisionId` is the new immutable recovery identity and is the
authoritative direction for Phase 8.

## Phase 8C.3

The next slice should make canonical document mutation commits revision-first:

1. hash the completed mutation bytes
2. publish/reuse that content-addressed revision
3. only then switch session bytes/documentKey/PageGraph/dependent state
4. set `activeRevisionId` to the published hash
5. preserve `originalRevisionId`
6. leave compatibility/headless paths explicitly byte-only where no registered
   session revision store exists

Phase 8D can then let PDF.js consume revision `DocumentSource` ranges, and
Phase 8E can move history from full-byte snapshots to revision references,
journals and bounded checkpoints.
