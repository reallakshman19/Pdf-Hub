# DocumentSource Architecture

Status: **Phase 8C.1 — source-aware admission plus working-revision storage boundary**.

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

Phase 8C.1 now introduces the engine-neutral `WorkingRevisionStore` boundary,
a memory fallback, persistent `OpfsRevisionStore`, and `OpfsSource`. A
committed revision id is immutable, and a failed/cancelled OPFS commit is not
published. Product session state still uses compatibility bytes; the active
revision-pointer migration is Phase 8C.2.

See `Docs/WORKING_REVISION_STORE.md`.

Phase 8D will bridge renderer consumption toward range-backed revisions.

Phase 8E will replace default whole-byte history retention with a journal and
bounded checkpoints.
