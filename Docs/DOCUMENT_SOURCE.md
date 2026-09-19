# DocumentSource Architecture

Status: **Phase 8D.2 — primary workspace revision/range-backed rendering**.

Tracking issue: #218.

## Purpose

`DocumentSource` is the byte-source boundary for the large-document
architecture. It separates document identity and random byte access from the
current whole-file `Uint8Array` session representation.

The contract is intentionally small:

```ts
interface DocumentSource {
  readonly id: string;
  readonly kind: DocumentSourceKind;
  readonly capabilities: Readonly<DocumentSourceCapabilities>;

  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
}
```

No PDF engine, session store, command, UI, React, Zustand or pdf-lib type
crosses this boundary.

## Range semantics

All sizes, offsets and lengths are JavaScript safe integers.

Reads are exact:

- `offset >= 0`
- `length >= 0`
- `offset <= size`
- `length <= size - offset`
- zero-length reads are valid, including at EOF
- invalid ranges reject; they are never silently clamped
- every successful read returns bytes owned by the caller

Typed source errors distinguish invalid IDs/sizes/ranges, out-of-bounds reads
and underlying read failures.

## Phase 8A adapters

### MemorySource

`MemorySource` snapshots the supplied `Uint8Array` once during construction.
Later caller mutations of the original array cannot change the source.

Every read returns a fresh `Uint8Array`; mutating a returned range cannot
change later reads.

This adapter is non-persistent and exists for compatibility, tests and small
in-memory revisions.

### BrowserFileSource

`BrowserFileSource` accepts a browser `Blob`/ `File`-compatible source and
uses:

```ts
file.slice(offset, offset + length)
```

Only that requested slice is materialized with `arrayBuffer()`. The adapter
does not call `file.arrayBuffer()` on the complete file.

A browser `File` is a `Blob`, so normal picker/drop `File` objects are now
wrapped by this adapter in primary PDF admission.

## Capability contract

Both Phase 8A adapters declare:

- random access: supported
- immutable read ownership: supported
- persistence: not provided

OPFS and file-handle adapters will extend the adapter family in later Phase 8
slices rather than changing the core contract.

## Phase 8B source-aware admission

Primary PDF admission now creates a `BrowserFileSource` after metadata
preflight.

Format identification reads only the first at-most 1024 bytes through the
source. A non-PDF input is rejected after that bounded range read; it is not
fully materialized, hashed or parsed.

For accepted inputs, current downstream consumers still require a contiguous
`Uint8Array`. Phase 8B makes this compatibility cost explicit through
`materializeDocumentSource(...)`:

- source size is validated first
- the existing 100 MB policy remains the materialization ceiling
- a single output `Uint8Array` is allocated
- source bytes are copied into it through bounded 4 MiB range reads
- cancellation is checked between ranges

This removes direct whole-file `File.arrayBuffer()` coupling from primary PDF
admission while preserving the existing document hash, PageGraph, PDF.js,
mutation and session byte semantics.

### Source identity vs document identity

`sourceId` is a process-local runtime identity for the immutable original
source. `documentKey` remains the SHA-256 content/revision identity used by
existing product state.

Actual `DocumentSource` objects are retained in an out-of-band runtime
registry. `DocumentSession` stores only `sourceId`; it does not place
`File` or `Blob` objects into Zustand state, commands or history records.

Opening another document releases the prior registered source. Clearing the
session releases the active source. Working-copy replacement and Save preserve
the original `sourceId`.

### Still deliberately materialized

Phase 8B does **not** yet make the working document file-backed:

- `DocumentSession` still stores `originalBytes` / `workingBytes`
- the 100 MB primary admission policy remains
- PDF.js still receives materialized bytes
- mutation sessions still open from bytes
- history still retains whole-PDF byte snapshots
- the content hash is still computed from materialized bytes

Phase 8C.1 introduced the engine-neutral `WorkingRevisionStore` boundary,
a memory fallback, persistent `OpfsRevisionStore`, and `OpfsSource`. A
committed revision id is immutable, and a failed/cancelled OPFS commit is not
published.

Phase 8C.2 wires this into primary admission. After PDF validation, the
SHA-256 `documentKey` is committed/reused as the initial working revision
before session commit. `DocumentSession` stores only the runtime
`revisionStoreId` plus `originalRevisionId` and `activeRevisionId`;
actual store objects remain out-of-band.

Phase 8C.3 extends the same invariant to canonical document mutations.
`DocumentTransaction` hashes the completed mutation, publishes/reuses the
content-addressed revision through a short-lived no-full-copy
`BorrowedBytesSource`, then persists annotations and switches application
state. Undo/redo history carries the matching active revision identity, though
history bytes remain snapshot-based until Phase 8E.

See `Docs/WORKING_REVISION_STORE.md`.

## Phase 8D.1 PDF.js source bridge substrate

The renderer adapter now has an explicit source-backed acquisition path using
`PDFDataRangeTransport`:

```text
DocumentSource
    |
    +-- size()
    |
    +-- read(begin, end - begin)
            |
            v
PdfJsDocumentSourceTransport
            |
            v
PDF.js
```

The source path:
- uses the caller-supplied content/revision id as public cache identity;
- does not hash, clone or materialize the complete source;
- keeps source-backed cache entries internally separate from byte-backed
  admission entries;
- preserves the existing document lease/LRU lifecycle;
- exposes range request/byte diagnostics without retaining buffers; and
- keeps the existing byte renderer API for compatibility/standalone workflows.

## Phase 8D.2 active workspace migration

The primary `DocumentWorkspace` now resolves renderer input through a
session-side bridge:

```text
revisionStoreId + activeRevisionId
        |
        v
WorkingRevisionStore.open(activeRevisionId)
        |
        v
DocumentSource
        |
        v
PdfRendererAdapter.acquireDocumentSource(...)
```

Revision-aware sessions never silently fall back to `workingBytes`. Missing,
stale or unavailable revision metadata fails explicitly. Legacy sessions with
all revision metadata absent retain the byte renderer path.

Workspace lease acquisition is abort-aware and reacts to revision identity
changes, so mutation A -> B and history restoration B -> A reacquire the
matching revision-keyed source entry.

The previous workspace-open loop that extracted text from every page into
`SearchIndexer` has been removed. Opening a document no longer deliberately
walks `1..numPages` for search indexing. Phase 8F owns visible/nearby-first
incremental indexing and background index persistence.

Phase 8D.3 removes the remaining active-session renderer byte
reacquisition paths. Search, Bookmarks and Select Box Copy now acquire an
explicit active-session lease from the same strict revision resolver used by
the workspace. Uncached Search and native outline logic operate on the leased
`PDFDocumentProxy`; Select Box exposes loaded-document text/image helpers.
Standalone explicit-buffer wrappers remain supported and continue to own their
own byte-backed lease lifecycle.

Phase 8E will replace default whole-byte history retention with a journal and
bounded checkpoints. Phase 8F remains responsible for visible/nearby-first
incremental search indexing rather than eager indexing during document open.
