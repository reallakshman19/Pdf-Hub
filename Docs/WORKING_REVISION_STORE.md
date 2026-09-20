# Working Revision Store

Status: **Phase 8E.5C4 — reference-aware revision reachability and garbage collection**.

Tracking: #218, #221, #223, #225, #278.

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
  listRevisionIds(): Promise<string[]>
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
- `listRevisionIds()` deterministically enumerates fully committed revision
  files and excludes pending/unpublished writes

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

## Phase 8C.3 canonical mutation publication

Canonical `DocumentTransaction` commits are now revision-first for
revision-aware sessions:

1. validate mutation page-count metadata and hash the completed output
2. resolve the session's registered `WorkingRevisionStore`
3. publish/reuse revision id == output SHA-256 documentKey
4. persist dependent annotations under that documentKey
5. switch session bytes, documentKey, PageGraph, annotations, Writer and OCR
6. append history containing the matching before/after activeRevisionIds

Revision publication uses `BorrowedBytesSource`: it borrows the already-owned
mutation output instead of cloning the entire PDF before OPFS writes, while
each range read remains caller-owned. The caller must keep the borrowed backing
bytes immutable for the publication lifetime.

If publication fails or is cancelled, annotation persistence and in-memory
state commit do not run. Revision-aware sessions do not silently fall back to
byte-only state. Compatibility/headless sessions with no `revisionStoreId`
keep the legacy byte-only transaction path.

Revision-aware undo/redo history now retains immutable revision locators rather
than whole-PDF byte snapshots by default. Durable history journals record the
same revision chain and recovery-complete barrier/periodic checkpoints. PDF.js
workspace rendering is revision/source backed; compatibility `workingBytes`
remains for mutation and older consumers while `PdfMutationEngine` still
materializes complete bytes for canonical structural mutations.

The legacy `originalBytes` field still follows old Save-baseline semantics;
`originalRevisionId` remains the immutable recovery identity and is the
authoritative Phase 8 direction.

A small peak-memory hardening accompanies the revision work: `FileAdapter` no
longer clones a full-span `ArrayBuffer` merely to hash an owned `Uint8Array`.
Subarrays and non-ArrayBuffer backing storage still copy safely.

## Phase 8E.5C4 inventory and collection

Storage enumeration is intentionally mechanical. `MemoryRevisionStore` and
`OpfsRevisionStore` return deterministic committed revision IDs through
`listRevisionIds()`; pending OPFS writes are excluded. History journal stores
return complete cloned manifest inventory through `listAll()`. Neither adapter
decides which revisions are retained.

The document-history GC policy marks as reachable every revision referenced by:

- the active session's immutable original and current active revision
- retained in-memory undo/redo before/after locators
- every retained journal's original and active revision
- every journal entry before/after revision
- every journal checkpoint revision
- explicit runtime liveness pins

The browser revision store is shared across documents, so GC consumes all
retained journals associated with the target store. Any missing referenced
revision makes the plan unsafe and no deletion begins.

Execution revalidates the full reference graph and storage inventory immediately
before sweep. A stale plan is rejected if references changed, a new revision
appeared, or a reachable revision disappeared. Partial deletion stops on the
first remove failure; retrying the same plan is accepted only when the inventory
difference consists of candidates already removed by that plan.

Persistent OPFS sweep requires origin-wide Web Locks. Admission and canonical
binary mutation hold the same exclusive store lock from revision publication
through journal publication. If a persistent session lacks persistent journal
coverage, that tab holds a shared GC-blocker lock until the session is replaced
or cleared; GC requests the exclusive counterpart and fails closed when such a
session is active.

8E.5C4 does not add age-based deletion, journal/checkpoint pruning, automatic
startup collection, or a UI GC trigger. Those decisions remain outside the
low-level revision-store contract.

## Still deliberately transitional

- `DocumentSession.originalBytes` / `workingBytes` remain compatibility bytes
- `PdfMutationEngine` still opens and saves materialized full-document bytes
- Save/Save As composition is not yet fully centralized/revision-first
- the 100 MB primary-open policy remains
- Phase 8E still needs closure/recovery certification before Phase 8F starts
