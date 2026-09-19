# DocumentSource Architecture

Status: **Phase 8A — contract and first adapters only**.

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

A browser `File` is a `Blob`, so normal picker/drop `File` objects can be
passed directly once Phase 8B wires admission to this boundary.

## Capability contract

Both Phase 8A adapters declare:

- random access: supported
- immutable read ownership: supported
- persistence: not provided

OPFS and file-handle adapters will extend the adapter family in later Phase 8
slices rather than changing the core contract.

## Deliberately not wired in 8A

Phase 8A changes **no product open/save behavior**.

Today:

- primary PDF admission still performs `file.arrayBuffer()`
- `DocumentSession` still stores `originalBytes` / `workingBytes`
- the 100 MB admission policy remains
- PDF.js still receives materialized bytes
- mutation sessions still open from bytes
- history still retains whole-PDF byte snapshots

Phase 8B will make document admission source-aware while retaining explicit
compatibility materialization for consumers that still require bytes.

Phase 8C will introduce file/OPFS-backed working revisions and lifecycle rules.

Phase 8E will replace default whole-byte history retention with a journal and
bounded checkpoints.
