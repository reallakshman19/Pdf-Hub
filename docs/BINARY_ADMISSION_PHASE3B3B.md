# Phase 3B.3B — Bounded JSON Source Bytes and UTF-8 Admission

## Baseline

```text
PHASE_3B3B_BASELINE
5162353b779f0f0436061b2be88bed61541a96e3
```

Phase 3B.3B starts from the merged Phase 3B.3A static member-profile gate.

## Closed policy

```text
WRITER_PROJECT_JSON_SOURCE_POLICY_V1
OWNER_APPROVED
```

The production policy is deeply immutable and has no runtime override. Tests may use a reduced V1-shaped policy only for deterministic fixtures.

## Path limits

All limits are UTF-8 source bytes and use binary units.

| JSON source | Maximum bytes |
|---|---:|
| `manifest.json` | 1,048,576 |
| `writer-elements.json` | 33,554,432 |
| `writer-assets.json` | 16,777,216 |
| `writer-document-meta.json` | 2,097,152 |
| `ocr/manifest.json` | 1,048,576 |
| `ocr/result.json` | 67,108,864 |
| `ocr/corrections.json` | 16,777,216 |
| `ocr/regions.json` | 16,777,216 |
| `ocr/writer-insertion-queue.json` | 33,554,432 |

Additional hard limits:

```text
MAX_TOTAL_JSON_SOURCE_BYTES = 100663296
UTF8_DECODE_CHUNK_BYTES = 262144
MAX_JSON_SOURCE_COUNT = 9
```

The JSON policy is independent of the ZIP resource policy, browser upload limits, file-adapter limits, and macro resource limits.

## Exact JSON catalog

```text
manifest.json
writer-elements.json
writer-assets.json
writer-document-meta.json
ocr/manifest.json
ocr/result.json
ocr/corrections.json
ocr/regions.json
ocr/writer-insertion-queue.json
```

A contract test derives the expected catalog from `WRITER_PROJECT_MEMBER_PROFILE_V1` and proves exact agreement.

These admitted members are binary or structural and are never decoded as JSON text:

```text
original.pdf
assets/<leaf-name>
assets/
ocr/
```

## Complete byte preflight

Phase 3B.3B consumes the admitted Phase 3B.3A member inventory, bounded member metadata, bounded archive reader, and standalone operation contract.

Preflight order is deterministic:

```text
policy identity
→ member-profile and extraction-profile consistency
→ cataloged JSON members in central-directory ordinal order
  → bounded metadata exists
  → ordinal and exact path agree
  → member classification permits JSON
  → actualExpandedBytes is within the path limit
→ JSON source count
→ aggregate JSON source bytes
→ UTF-8 decoding
```

No JSON bytes are read and no text decoder is created until every present JSON source passes byte, count, and aggregate preflight.

A leading UTF-8 BOM is included in byte accounting.

## Fatal cancellable UTF-8 decoding

After complete preflight, JSON sources are decoded sequentially in central-directory ordinal order with:

```text
TextDecoder('utf-8', { fatal: true })
```

Input is fed in chunks no larger than 262,144 bytes. Operation cancellation and currency are checked before and after every chunk and before and after decoder flush.

Malformed UTF-8, truncated sequences, overlong encodings, UTF-16, and UTF-32 are rejected. A leading UTF-8 BOM is permitted and recorded. Empty or whitespace-only UTF-8 is admitted because this phase validates encoding, not JSON syntax.

Each present JSON member is read and decoded exactly once. Partial decoded text is discarded after any failure.

## Admitted source-set ownership

The public admitted source set exposes only immutable metadata:

```text
ordinal
path
sourceBytes
decodedCodeUnits
hadUtf8Bom
```

Decoded strings are held in a private registry. `JsonAdmittedProjectArchiveReader`:

- delegates `has`, `readBytes`, and `listPaths` to the bounded archive reader;
- returns the already admitted immutable string for JSON `readText` calls;
- never re-reads or re-decodes an admitted JSON member;
- rejects text access for a non-admitted path.

`releaseAdmittedProjectJsonSources(...)` clears the private string registry. After release, text reads fail deterministically while immutable evidence remains available.

## Evidence

```text
WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_V1
```

Evidence contains the policy identity and exact limits, source member-profile ID, source extraction-policy and evidence IDs, JSON source records in ordinal order, present source count, aggregate source bytes, aggregate decoded code units, BOM count, ordered diagnostics, final outcome, and cancellation stage when applicable.

Each source record contains ordinal, path, member classification, actual bytes, approved limit, decoded code units, BOM status, byte outcome, and UTF-8 outcome.

Evidence is deeply immutable and retains no byte arrays, decoded strings, parsed JSON, or partial failed text.

## Production integration and release order

```text
Phase 3B.1 structural admission
→ Phase 3B.2 declared-resource admission
→ Phase 3B.3A static member-profile admission
→ Phase 3B.2 bounded extraction and CRC verification
→ Phase 3B.3B complete JSON byte admission
→ fatal chunked UTF-8 admission
→ admitted JSON source reader
→ existing Writer and OCR JSON.parse semantics
→ Phase 3A.1 staging and commit
```

The standalone controller releases ownership in `finally` order:

```text
admitted JSON source strings
→ bounded member set
→ source archive references
```

JSON-source rejection or cancellation cannot begin Writer/OCR semantic decoding and cannot create a staged capability or mutate stores.

## Compatibility

The Writer and OCR codecs continue to use `ProjectArchiveReader.readText` and their existing `JSON.parse`, manifest validation, fingerprint normalization, asset reconstruction, and OCR payload validation. The production reader returns the already admitted strings. Compatibility wrappers using JSZip remain available outside the standalone route.

Exported project bytes and schemas are unchanged.

## Explicit limitations

Phase 3B.3B bounds JSON source bytes and validates UTF-8 before parsing.

It does not bound JSON depth, nodes, tokens, properties,
parsed objects, or semantic references.

It also does not provide manifest-reference reconciliation, asset-reference reconciliation, Writer element or asset-count policy, OCR semantic admission, embedded PDF attachment admission, image or structured-text admission, global browser-memory accounting, Phase 3B.3C, Phase 3C, or later work.
