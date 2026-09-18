# Phase 2B — Batch-PDF Admission and Bounded Result Retention

## Scope

Phase 2B originally established the source-admission and bounded-retention
contract for batch macro execution.

As of the Phase 3 Automate consolidation, the production entry point has moved
from `ToolbarOrganize` to
`components/macro/advanced/MacroBatchRunPanel.tsx` under **Automate**.
`runMacroBatch(...)` still returns a metadata-only JSON report, but it now also
accepts an optional sequential `onOutput` callback. The Automate batch panel
uses that callback to download each transformed PDF immediately as its input
finishes; output PDF bytes are not retained in the report or accumulated across
the batch.

## Baseline

```text
main
f4a00e7db501754519e178111c74037abab9fb31
```

## Source lifecycle

The production route now follows this lifecycle:

```text
picked file sources in picker order
→ complete metadata preflight
→ sequential read of one current file
→ PDF signature and positive page-count validation
→ one existing macro execution
→ sequential transformed-PDF handoff through onOutput
→ metadata-only result record
→ release current input and output references
→ next file
→ JSON report
```

The toolbar no longer calls `pickPdfFiles(true)` for batch execution. It passes
`PickedPdfFileSource` values to the shared batch boundary, so selection does not
resolve every file into a `Uint8Array` before processing begins.

## Metadata preflight

Before the first `arrayBuffer()` call, Phase 2B inspects every selected file's:

- picker-order input index;
- file name;
- MIME type;
- source byte size.

The existing per-file policy remains authoritative:

```text
Authority: EXISTING_SOURCE_POLICY
Source: FileAdapter.MAX_PDF_SIZE_BYTES
Value: 100 MiB per selected PDF
```

If any selected file fails metadata or per-file size checks, the complete
selection is rejected before any file read or macro execution.

## Aggregate policy

Phase 2B measures:

```text
SELECTED_FILE_COUNT
AGGREGATE_SOURCE_BYTES
```

No owner-approved global batch-file-count or aggregate-source-byte threshold
exists. Evidence therefore records `UNRESOLVED_POLICY` provenance for those
aggregate dimensions. `maxDonorFiles` and `maxDonorBytes` remain macro donor
limits and are not applied to independent batch inputs.

## Sequential ownership

`runMacroBatch(...)` processes sources with a single ordered loop. It contains no
`Promise.all` over reads and does not create a complete batch byte collection.
Only the current file's input bytes enter page counting and `executeMacroRecipe`.

Per-file input bytes and macro final bytes remain local to the current
iteration. After a successful execution, `runMacroBatch(...)` may hand the
current transformed PDF to the caller through `onOutput`; the Automate UI
downloads that PDF immediately. The runner then records output byte length and
logs and returns only metadata. Completed PDF payloads are not retained in
report records, stores, or cross-file batch collections.

## Report contract

Batch records are serializable metadata unions:

- `success`: input index, file name, input bytes, page count, output bytes, logs;
- `failed`: input index, file name, input bytes, optional page count, error, logs;
- `cancelled`: input index, file name, input bytes, optional page count, error, logs;
- `not-run`: input index, file name, input bytes, reason, logs.

The report contains no `Uint8Array`, `ArrayBuffer`, `Blob`, `File`, file-system
handle, donor capability, or encoded PDF payload.

## Failure and cancellation

With `continueOnError: true`, invalid PDFs and macro failures produce ordered
failure records and processing continues with the next source. With
`continueOnError: false`, the first failure is recorded and later sources are
marked `not-run` without being read.

Cancellation checkpoints exist before and after reads, page counting, macro
execution, success recording, and advancing to the next source. Abort racing
suppresses late browser reads and late macro completions so they cannot create
success records or start later work.

## Preserved macro authority

`DEFAULT_MACRO_RESOURCE_LIMITS` remains unchanged and continues to govern:

- macro input PDF bytes;
- donor-file count and donor bytes;
- working PDF bytes;
- output-file count and output bytes;
- executed steps;
- execution duration.

Phase 2B does not reinterpret or modify any macro numeric policy.

## Certification criteria

The final exact PR head must pass Frontend Certify, Frontend CI, and Writer
Overlay V2. Certification includes lint, strict TypeScript, the complete Vitest
suite, static audit, production builds, release gating, and E2E smoke coverage.
Temporary diagnostic or bootstrap workflows are not part of the final diff.

## Phase 3 extension and remaining deferred work

Phase 3 resolves the original transformed-output deferral by handing each
successful transformed PDF to the Automate UI sequentially. This does **not**
change the metadata-only report contract or introduce an aggregate in-memory
output collection.

The following remain deferred:

- batch output ZIP generation;
- a dedicated batch-results workspace beyond the downloaded JSON report;
- ordinary donor-command changes;
- Writer, OCR, image, archive, and structured-text admission;
- global memory or history policy.
