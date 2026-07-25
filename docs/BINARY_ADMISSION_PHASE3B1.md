# Binary Admission Phase 3B.1

## Raw ZIP Inventory and Structural Admission

Phase 3B.1 inserts a read-only raw ZIP inspection boundary before the standalone Writer project compatibility decoder.

```text
standalone .pdfhub.zip or .zip
→ source metadata classification
→ source-byte read
→ leading ZIP signature check
→ raw EOCD and central-directory inspection
→ local-header and byte-range reconciliation
→ structural admission
→ existing JSZip compatibility decoder
→ Phase 3A.1 semantic staging
→ coordinated commit
```

A structurally rejected archive never reaches JSZip, JSON decoding, original-PDF parsing, Writer staging, or application-state mutation.

## Exact predecessor baseline

```text
PHASE_3A1_MERGE_BASELINE
f67cc6ed788494754698e8f75ab367b59523ac44
```

PR #136 was squash-merged with an `expected_head_sha` guard against certified feature head:

```text
d5293a84fe944fc8ffacb9231f48ef3615eac33b
```

## Supported structural profile

The admitted profile is deliberately narrow:

```text
single-disk ZIP
non-ZIP64
central-directory-based
stored entries, method 0
deflated entries, method 8
unencrypted
non-spanned
non-segmented
```

Unsupported structures fail closed. Phase 3B.1 does not silently reinterpret ZIP64, split archives, encrypted entries, or vendor compression methods.

## Raw structures inspected

The inspector operates directly on `Uint8Array` bytes and invokes no JSZip, decompression, JSON parser, PDF parser, or application store.

It inventories:

- end-of-central-directory fields and format-defined comment range;
- every raw central-directory record in ordinal order;
- raw, decoded, and normalized member names;
- flags, method, CRC declaration, compressed size, uncompressed size, and local-header offset;
- local-header signature, name, relevant flags, method, CRC, and size declarations;
- local header, local filename, local extra-field, compressed-payload, central-directory, and EOCD byte ranges;
- exact raw-name, decoded-name, normalized-path, and file/directory collision groups;
- aggregate declared archive measurements.

The inventory is deeply immutable. Raw filenames are retained as frozen numeric byte arrays rather than mutable typed-array views.

## Filename policy

UTF-8 filenames are decoded with a fatal UTF-8 decoder when general-purpose flag bit 11 is set.

The current Writer exporter emits ASCII-compatible project member paths. For non-UTF-8 legacy records, Phase 3B.1 accepts only deterministic ASCII bytes and fails closed for non-ASCII legacy encoding rather than depending on browser locale.

Admission analysis converts backslashes to slashes and removes repeated separators and `.` segments only for collision analysis. It never rewrites the archive.

The following are rejected:

- parent traversal segments;
- absolute POSIX paths;
- Windows drive paths;
- UNC paths;
- embedded NUL or unsafe control characters;
- empty normalized paths;
- file/directory ambiguity.

## Duplicate and collision policy

Every raw central-directory record is preserved before duplicate analysis.

Admission rejects:

- exact raw-name duplicates;
- decoded-name duplicates;
- normalized-path collisions;
- regular files that conflict with directory records or descendant paths.

Each collision group retains all conflicting central-directory ordinals.

## Local-header and region reconciliation

For every central-directory record, the inspector resolves and validates the referenced local file header.

It verifies:

- local signature and fixed fields are in range;
- local and central filenames match byte-for-byte;
- compression methods match;
- relevant general-purpose flags match;
- non-descriptor CRC and size declarations match;
- descriptor-enabled local declarations are zero or equal to central declarations;
- compressed payload ranges remain inside source bytes and before the central directory;
- no local header begins inside the central directory;
- no local ownership range overlaps another entry;
- no local-header offset is owned by multiple records;
- the first supported local header begins at source offset zero.

All offset and length additions use explicit safe-integer checks and little-endian readers.

## Structural outcomes

The inventory uses explicit outcomes:

```text
ADMITTED
REJECTED_MALFORMED
REJECTED_UNSUPPORTED
REJECTED_UNSAFE_PATH
REJECTED_DUPLICATE
REJECTED_ENCRYPTED
REJECTED_RANGE_CONFLICT
CANCELLED
```

Malformed archives do not collapse to `null`, `false`, or ordinary project absence. Admission errors retain the immutable inventory and deterministic first diagnostic.

## Cancellation boundary

The standalone project route checks cancellation and operation currency:

- before source read;
- after source read;
- before raw ZIP inspection;
- after raw ZIP inspection;
- before compatibility ZIP decoding.

Cancellation or supersession after raw inspection prevents the compatibility decoder from running.

## Measured unresolved dimensions

Phase 3B.1 introduces no owner-policy numerical archive limits.

The inventory measures:

```text
SOURCE_BYTES
RAW_ENTRY_COUNT
CENTRAL_DIRECTORY_BYTES
TOTAL_COMPRESSED_BYTES_DECLARED
TOTAL_UNCOMPRESSED_BYTES_DECLARED
MAX_ENTRY_COMPRESSED_BYTES
MAX_ENTRY_UNCOMPRESSED_BYTES
MAX_DECLARED_COMPRESSION_RATIO
FILENAME_BYTES_TOTAL
EXTRA_FIELD_BYTES_TOTAL
COMMENT_BYTES_TOTAL
```

Each carries `UNRESOLVED_POLICY` provenance. Format-defined 16-bit comment and variable-field widths are structural ZIP rules, not application policy thresholds.

Phase 3B.1 does not claim ZIP-bomb containment, bounded decompression, approved archive-size limits, or bounded retained memory.

## Compatibility and non-scope

The current Writer project exporter remains unchanged and continues to emit ordinary DEFLATE archives accepted by the supported profile. Existing PDF-overlay, blank Writer, OCR-bearing, and OCR-free project compatibility remains governed by the existing project codec and Phase 3A.1 semantic stage.

This phase does not change:

- embedded round-trip PDF attachment traversal;
- OCR hydration or OCR admission;
- Writer image admission;
- structured-text admission;
- archive export or archive rewriting;
- macro processing;
- global resident-memory policy;
- Phase 3B.2, Phase 3C, Phase 4, or later work.
