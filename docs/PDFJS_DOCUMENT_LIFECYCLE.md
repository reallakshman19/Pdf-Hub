# PDF.js Document Lifecycle

PDF Hub manages loaded PDF.js documents through explicit `PdfDocumentLease` ownership.

Two acquisition paths now exist:
- `PdfRendererAdapter.acquireDocument(bytes)` for compatibility / standalone byte workflows.
- `PdfRendererAdapter.acquireDocumentSource({ source, cacheKey, signal })` for immutable random-access revisions.

## Ownership rules

- Every consumer acquires a lease before using a `PDFDocumentProxy`.
- Short-lived operations release the lease in `finally` after cleaning any page proxies.
- The workspace retains its lease while the active document is rendered and releases it when the document changes or the workspace unmounts.
- Consumers must not call `PDFDocumentProxy.destroy()` directly. Destruction is owned by the adapter cache.
- Lease release is idempotent.

## Cache policy

- Byte-path cache identity is the SHA-256 of the complete PDF bytes, not JavaScript object identity.
- Source-path public cache identity is supplied explicitly from the content-addressed revision id; the renderer does not hash or materialize the source to discover identity.
- Source-backed entries use an internal cache namespace separate from byte-backed entries. This prevents an admission-time whole-byte PDF.js document from masking the range-backed path merely because both represent the same SHA-256 revision.
- Concurrent acquisitions of the same source revision key share one PDF.js loading task and one proxy.
- The cache retains at most two idle documents using least-recently-used eviction.
- Active leased documents are never evicted. The cache may temporarily exceed two entries while more than two different PDFs are actively leased.
- When an idle entry is evicted, the adapter calls `destroy()` and removes the entry.
- Failed loads are removed so later acquisitions can retry.

## Page lifecycle

Every `PDFPageProxy` obtained with `getPage()` must call `cleanup()` in `finally`. Releasing a document lease does not replace page cleanup.

## Diagnostics

`PdfRendererAdapter.getDocumentCacheDiagnostics()` reports:

- total cache entries;
- active lease count;
- idle entry count; and
- the configured maximum idle-cache size.

`clearDocumentCache()` is intended for controlled cleanup and tests. Without `force`, it destroys idle entries only.


## Phase 8D.1 range-backed source path

`PdfJsDocumentSourceTransport` adapts PDF.js `PDFDataRangeTransport` to the
engine-neutral `DocumentSource` contract.

PDF.js range requests map exactly:

```text
requestDataRange(begin, end)
    -> source.read(begin, end - begin)
    -> onDataRange(begin, callerOwnedChunk)
```

The initial source path uses:
- 64 KiB range chunks;
- range loading enabled;
- streaming disabled; and
- automatic prefetch disabled.

The transport does not read during construction. `abort()` suppresses late
delivery from bounded Blob/OPFS reads that were already in flight. Invalid
ranges, read failures and exact-length violations fail closed and stop future
delivery.

The source path deliberately keeps the existing byte API. Phase 8D.2 now uses
the source path for revision-aware primary workspace sessions. Legacy sessions
with no revision metadata continue to use the byte path.

Workspace ownership remains lease-based: revision changes abort the waiting
source acquisition and release the prior lease. A revision-aware session with
missing/stale revision metadata fails instead of silently reopening
`workingBytes`.

## Source diagnostics

`PdfRendererAdapter.getDocumentSourceCacheDiagnostics()` reports source
entries without retaining any PDF byte buffers:
- public revision/cache key;
- source id and source kind;
- source size;
- active lease count;
- whether PDF.js document loading completed;
- range request count;
- total range bytes delivered;
- maximum requested range size;
- aborted/failed transport state.


## Phase 8D.3 active consumer ownership

The remaining active-session renderer consumers now use the revision-keyed
lease path rather than independently reacquiring PDF.js from
`DocumentSession.workingBytes`:

- uncached Search acquires the active session lease and runs
  `searchDocumentTextInDocument(...)` against that proxy;
- native Bookmarks/outline loading acquires the active session lease and
  releases it after outline resolution; and
- active Select Box Copy acquires a lease per extraction/image operation and
  delegates to loaded-document helpers.

`activePdfDocumentLease.ts` is a narrow coordinator over the session-side
renderer-input resolver. It receives an explicit session snapshot and therefore
does not make `PdfRendererAdapter` depend on Zustand/session state. Revision-
aware sessions use `acquireDocumentSource(...)`; legacy sessions with no
revision metadata retain the byte path.

Cancellation is part of lease ownership. Waiting active operations receive an
`AbortSignal`, late byte-backed acquisition is released if cancellation wins,
page proxies call `cleanup()`, and Select Box render tasks are cancelled.

Standalone APIs that intentionally receive explicit bytes remain valid:
`searchDocumentText(bytes,...)`, `extractSelectBoxCopyFromPdf(...)`, and
`renderSelectBoxImageSnapshot(...)` keep their byte-backed compatibility
behavior and own their own leases.
