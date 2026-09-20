# Phase 8G — Large-document performance certification

WP-8G turns Phase 8 scalability claims into repeatable evidence. This file documents the benchmark contract and current evidence state; it must not be read as a claim that the benchmarks have executed.

## Current evidence

Runner benchmark state: NOT_RUN.

GitHub Actions issue #183 has been observed terminating jobs before runner assignment, so zero-step workflow failures are infrastructure evidence, not executable benchmark failures or passes.

The mandatory active-query regression is structural and deterministic: under the former publication path, page arrival k could rescan pages 1..k. For 1,000 arrivals that is 1 + 2 + ... + 1000 = **500,500** page-match invocations. The Phase 8G target is one page match per newly indexed page under an unchanged query, or 1,000 calls for the 1,000-page fixture.

## Corpus

The checked-in generator is `frontend/scripts/phase8g-generate-fixtures.mjs`. It consumes `frontend/performance/phase8g-budget-manifest.json` and creates deterministic PDF fixtures plus a manifest with SHA-256 identities.

The corpus contract includes:

- native-text PDFs at 100, 500, 1,000, 2,500 and 5,000 pages;
- image-heavy PDFs;
- scanned/image-only PDFs;
- mixed page sizes and rotations;
- metadata-rich PDFs including deterministic document metadata and an AcroForm field.

The generated binaries are benchmark artifacts rather than source-controlled product assets.

## Search/indexing budget

The active-query complexity budget is exact: each newly indexed page may invoke matching for that page once. Query, case, whole-word and regex changes may rescan already extracted text, but must not cause PDF.js text re-extraction.

Search identity remains `activeRevisionId + PageId`. Page numbers are presentation data resolved from the current PageGraph. Superseded indexing owners may not publish stale page text or hits.

## Range-backed viewing

PDF.js viewing remains source/range backed. `PdfJsDocumentSourceTransport` exposes range request count, delivered range bytes and maximum requested range size for benchmark capture.

Performance evidence must report time to first renderable page and bytes/ranges consumed before first-page use. The benchmark must distinguish these observations from mutation behavior.

## Full-materialization mutation/save

The canonical mutation engine still opens from a complete `Uint8Array` and pdf-lib loads the full input. Commit calls `PDFDocument.save()` and returns complete output bytes.

Accordingly, range-backed viewing is not evidence that mutation/save is range bounded. Phase 8G must record full-materialization mutation/save cost, including latency and peak memory where instrumentation supports it.

## Certification commands

- `npm run generate:phase8g-fixtures`
- `npm run audit:phase8-large-document-performance`
- `npm run benchmark:phase8g:evaluate -- --input=<observation.json> --out=<report.json>`
- `npm run certify:phase8g`

The static audit validates the corpus/budget contract, the single-page search publication path, the 1,000-page matcher-count regression, range diagnostics, and the explicit mutation materialization boundary. The benchmark evaluator requires environment metadata and fixture identity, applies checked-in thresholds to independently captured observations, and emits `phase8g-benchmark-report-v1` PASS/FAIL JSON.

Measured supported limits remain unclaimed until benchmark execution produces exact-head result artifacts.
