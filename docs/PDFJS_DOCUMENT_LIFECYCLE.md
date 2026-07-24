# PDF.js Document Lifecycle

PDF Hub manages loaded PDF.js documents through `PdfRendererAdapter.acquireDocument()` leases.

## Ownership rules

- Every consumer acquires a lease before using a `PDFDocumentProxy`.
- Short-lived operations release the lease in `finally` after cleaning any page proxies.
- The workspace retains its lease while the active document is rendered and releases it when the document changes or the workspace unmounts.
- Consumers must not call `PDFDocumentProxy.destroy()` directly. Destruction is owned by the adapter cache.
- Lease release is idempotent.

## Cache policy

- Cache identity is the SHA-256 of the complete PDF bytes, not JavaScript object identity.
- Concurrent acquisitions of identical content share one PDF.js loading task and one proxy.
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
