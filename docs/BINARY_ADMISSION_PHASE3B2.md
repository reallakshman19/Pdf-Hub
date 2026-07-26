# Binary Admission Phase 3B.2

## Archive Resource Policy and Bounded ZIP Extraction

## Exact baseline

```text
PHASE_3B2_BASELINE
435e4b9473d6bb2499e7d5ff72c00901b808bdf2
```

The baseline is the exact Phase 3B.1 squash merge commit. Phase 3B.1 remains authoritative for EOCD, central-directory, local-header, path, duplicate, collision, flag, compression-method, and byte-range interpretation.

## Policy authority

```text
Profile:   WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1
Authority: OWNER_APPROVED
```

All limits are hard rejection limits. V1 is closed and is not configurable through environment variables, storage, URL state, UI state, or ordinary production callers.

## Approved values

| Dimension | Value |
|---|---:|
| `MAX_SOURCE_ARCHIVE_BYTES` | 167,772,160 bytes (160 MiB) |
| `MAX_RAW_ENTRY_COUNT` | 2,048 entries |
| `MAX_ENTRY_COMPRESSED_BYTES` | 134,217,728 bytes (128 MiB) |
| `MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES` | 134,217,728 bytes (128 MiB) |
| `MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES` | 268,435,456 bytes (256 MiB) |
| `MAX_DECLARED_ENTRY_COMPRESSION_RATIO` | 200 |
| `MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO` | 100 |
| `MAX_ACTUAL_EXPANDED_MEMBER_BYTES` | 134,217,728 bytes (128 MiB) |
| `MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES` | 268,435,456 bytes (256 MiB) |
| `MAX_ACTIVE_EXTRACTION_BYTES` | 150,994,944 bytes (144 MiB) |
| `MAX_INFLATE_OUTPUT_CHUNK_BYTES` | 1,048,576 bytes (1 MiB) |
| `COMPRESSED_INPUT_CHUNK_BYTES` | 262,144 bytes (256 KiB) |

The PDF picker, macro execution, browser upload, and server request limits are separate policies and are not referenced or aliased.

## Ratio definitions

Per-entry declared ratio:

```text
declared uncompressed bytes / declared compressed bytes
```

Archive declared ratio:

```text
TOTAL_UNCOMPRESSED_BYTES_DECLARED / TOTAL_COMPRESSED_BYTES_DECLARED
```

Zero-denominator behavior is deterministic:

```text
compressed = 0 and uncompressed = 0 → ratio 0
compressed = 0 and uncompressed > 0 → positive infinity → reject
```

Ratios are compared without rounding.

## Production boundary

The standalone Writer project route is:

```text
metadata classification
→ source-size admission before File.arrayBuffer()
→ source-byte read and metadata-length reconciliation
→ ZIP signature check
→ Phase 3B.1 raw structural inventory
→ Phase 3B.1 supported-profile admission
→ complete declared-resource admission
→ sequential bounded extraction of every regular entry
→ actual expansion and CRC-32 verification
→ immutable bounded member set
→ library-neutral ProjectArchiveReader
→ existing Writer and OCR compatibility parsing
→ Phase 3A.1 semantic reconciliation
→ immutable staging
→ coordinated commit
```

The standalone route does not call `JSZip.loadAsync(projectBytes)`. JSZip remains in the exporter and in explicitly retained compatibility wrappers, including embedded round-trip PDF import.

## Declared versus actual resources

Declared admission uses only the immutable Phase 3B.1 inventory. It evaluates:

```text
source bytes
→ raw entry count
→ each central-directory record by ordinal
   → compressed bytes
   → declared uncompressed bytes
   → declared ratio
→ total declared uncompressed bytes
→ archive declared ratio
```

No member is expanded until the complete declared archive passes.

Actual extraction independently counts output emitted by stored copying or raw-DEFLATE inflation. ZIP declarations do not substitute for actual byte accounting.

## Extraction mechanism

The exact lock-resolved dependency `fflate@0.8.2` is promoted as the single direct frontend inflation dependency. It is MIT licensed, browser compatible, supports incremental raw-DEFLATE input, and does not require Node-only APIs.

Compressed input is fed in chunks no larger than `COMPRESSED_INPUT_CHUNK_BYTES`. DEFLATE output is accepted only through a controlled callback. Before an output chunk is retained, the extractor computes the next member, archive, active-extraction, and output-chunk values and rejects before copying when a limit would be exceeded.

Stored entries are copied through the same accounting boundary. Stored compressed and uncompressed declarations must be equal.

## Sequential extraction

Entries are processed in central-directory ordinal order. Directory entries are skipped. Every regular entry, including an unknown but structurally valid entry, is extracted under the same hard limits.

Only one member is unfinished at a time. No `Promise.all`, extraction pool, or parallel member inflation is used.

Unknown regular entries are classified as:

```text
UNCLASSIFIED_MEMBER_POLICY_DEFERRED
```

They are not rejected solely for being unknown. Final project-member allow-list policy remains deferred.

## Output and active-byte accounting

For each output chunk, the extractor checks before retention:

```text
next member actual expanded bytes
next archive actual expanded bytes
next active extraction bytes
output chunk bytes
```

`activeExtractionBytes` includes the destination retained for the unfinished member plus the current output chunk and explicitly retained extraction scratch output. Completed member buffers remain part of archive actual expansion but are not double-counted as unfinished active extraction.

The immutable evidence records peak active extraction and the largest output chunk. It contains no rejected partial payload bytes.

## CRC-32 verification

CRC-32 is computed incrementally over actual expanded output for stored and DEFLATE members. A member is finalized only when:

```text
actual expanded bytes = declared uncompressed bytes
actual CRC-32 = Phase 3B.1 declared CRC-32
DEFLATE stream reached terminal completion, when applicable
```

CRC-32 is an integrity check, not a security hash.

## Member ownership and archive reader

Successful regular members are held by a private `BoundedZipMemberSet` registry. Public metadata does not expose its internal byte arrays. `BoundedZipMemberSetArchiveReader.readBytes()` returns a defensive copy.

The semantic boundary is library-neutral:

```text
ProjectArchiveReader
├─ has(path)
├─ readBytes(path)
├─ readText(path)
└─ listPaths()
```

`readText()` uses fatal UTF-8 decoding. Malformed UTF-8 fails closed as `REJECTED_UTF8`.

The Writer project codec shares semantic logic through `importPdfHubWriterProjectFromReader(reader)`. The existing byte-array wrapper remains for compatibility routes outside Phase 3B.2.

## OCR compatibility boundary

OCR-bearing standalone projects use `readOcrProjectPayloadFromReader(reader)`. Existing OCR member names, optionality, parsing, fingerprint normalization, and payload output are preserved.

Phase 3B.2 does not add OCR semantic admission, OCR count policy, graph policy, or OCR store hydration.

## Cancellation, supersession, and cleanup

The extractor consumes the existing standalone operation identity, generation, `AbortSignal`, `isMounted()`, and `isCurrent()` contracts.

Checks occur before each member, before each input chunk, before each output retention, after inflater callbacks, before member finalization, before member-set registration, and before semantic decode.

On cancellation, supersession, or failure:

- no further compressed input is fed;
- the inflater reference is released;
- current partial output is discarded;
- operation-owned completed members are cleared;
- the bounded member set does not escape;
- semantic decoding does not run;
- staging and store mutation do not occur;
- source and extraction references are cleared in `finally` blocks.

Garbage collection is not treated as the ownership contract; operation-owned arrays, maps, callbacks, member registries, and inflater references are explicitly cleared or released.

## Evidence contract

```text
ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1
```

Evidence includes:

- policy profile, authority, and exact limits;
- source and declared archive measurements;
- declared admission outcome;
- member evidence in central-directory order;
- ordinal and normalized path;
- classification and compression method;
- declared and actual sizes and CRC values;
- declared ratio;
- input/output chunk counts and largest output chunk;
- archive actual expansion and peak active extraction;
- extracted and skipped counts;
- ordered diagnostics;
- archive outcome and cancellation stage.

Evidence is deeply immutable and contains metadata only for rejected partial members.

## Known limitations and explicit non-scope

Phase 3B.2 provides bounded archive extraction.
It does not provide bounded JSON complexity, global memory containment,
or complete project-member semantic admission.

This increment does not add:

- bounded JSON depth, node, or object retention policy;
- Writer element-count or asset-count policy;
- final unknown-member allow-list policy;
- embedded round-trip PDF attachment admission;
- OCR semantic admission;
- image or structured-text admission;
- ZIP64 or data-descriptor support;
- project export-format changes;
- global browser resident-memory policy;
- Phase 3B.3, Phase 3C, Phase 4, or later work.
