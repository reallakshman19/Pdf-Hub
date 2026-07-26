# ST-1 — Bounded PS/ISONOTE Structured-Text Admission

## Baseline

```text
ST1_BASELINE
9e1757b1cf57f1bdd5e1289e3da26f82b557af13
```

This baseline contains the merged PS/ISONOTE sample loaders and Phase 3B.3B Writer-project JSON source admission.

## Closed policy

```text
PS_ISONOTE_TEXT_ADMISSION_POLICY_V1
OWNER_APPROVED
```

The production policy is deeply immutable and has no UI or runtime override. Tests may create a reduced V1-shaped policy only through the dedicated test factory.

| Limit | V1 value |
|---|---:|
| Maximum source UTF-8 bytes | 1,048,576 |
| Maximum logical rows | 5,000 |
| Maximum columns per row | 16 |
| Maximum UTF-8 bytes per cell | 16,384 |
| Maximum unique mappings | 2,000 |
| Maximum retained warnings | 200 |

These limits are independent of PDF, ZIP, Writer, OCR, upload-adapter, and macro-resource policies.

## Admitted ingress routes

One PS/ISONOTE-specific admission service owns all three current ingress routes:

```text
uploaded CSV / TSV / TXT
pasted or typed table
embedded CSV / TSV / pipe-table sample
```

Application-owned samples use the same production boundary and retain their existing filenames, MIME types, download bytes, and parser-visible content.

## Uploaded-file acquisition

An uploaded file is admitted in this order:

```text
extension or MIME compatibility
→ File.size preflight
→ one arrayBuffer() read
→ actual byte-length verification
→ one TextDecoder('utf-8', { fatal: true }) decode
→ structural preflight
→ existing semantic parser
```

The extension-or-MIME rule preserves the existing browser file-picker contract, including valid `.csv`, `.tsv`, and `.txt` files reported with generic MIME types.

A file whose metadata exceeds 1 MiB is rejected before `arrayBuffer()`. Production does not call `File.text()`. A leading UTF-8 BOM is accepted and remains included in byte accounting. Malformed UTF-8, UTF-16, and other invalid encodings are rejected deterministically.

The file input is reset after each attempt so the same file may be selected again. A rejected file does not replace the last admitted source or parsed mapping and does not clear the current PDF, scan, audit, or session state.

## Pasted and typed text

JavaScript code-unit length is checked first because a value longer than the byte limit cannot fit in UTF-8. Otherwise, exact UTF-8 length is measured without retaining an encoded byte copy.

Policy-rejected candidates are not committed to controlled component state. The textarea therefore continues to show the last admitted value. Structurally safe but semantically incomplete typed text preserves the existing parser-error behavior so users may type incrementally; containment rejection remains transactional.

## Structural preflight

Structural measurement is a deterministic linear scan performed before `parsePsIsonoteTable` allocates its complete row matrix. It records:

```text
source UTF-8 bytes
decoded code units
leading BOM
detected delimiter
logical row count
maximum raw columns in one logical row
maximum UTF-8 bytes in one decoded cell
```

The scan preserves the current comma, tab, semicolon, and pipe delimiter selection and quote behavior. It handles doubled quotes, delimiters and line breaks inside quoted fields, CRLF and LF endings, and optional leading or trailing pipe cells.

Every non-empty logical row counts, including the header and Markdown separator rows. Quoted line breaks remain inside one logical row. Raw columns are counted before header or Markdown-separator interpretation.

Structural rejection outcomes are:

```text
REJECTED_SOURCE_BYTES
REJECTED_UTF8
REJECTED_ROW_COUNT
REJECTED_COLUMN_COUNT
REJECTED_CELL_BYTES
```

Structurally rejected text never reaches the semantic parser.

## Semantic compatibility and mapping count

After structural admission, the existing parser remains authoritative for:

- PS-number and Unicode-dash normalization;
- PS, ISONOTE, and family aliases;
- headerless inference;
- quoted notes and family values;
- first-row-wins duplicate handling;
- conflicting, invalid, and empty-row warnings;
- CSV, TSV, semicolon, and Markdown pipe-table compatibility.

A successful parse is rejected with `REJECTED_MAPPING_COUNT` when it contains more than 2,000 unique mappings. Rejection occurs before mapping hashing, PDF scanning, annotation planning, audit construction, verification, or evidence packaging.

Safe text that produces the parser's existing syntax or semantic error remains retained with that same error. ST-1 does not invent a second semantic parser.

## Warning retention

The parser's warning order remains source-row deterministic. Evidence records the complete warning count, while retained operational warnings are limited to 200.

When truncation is required, the first 199 warnings are retained and the final entry reports how many warnings were suppressed. Truncation is not an admission rejection.

## Evidence

```text
PS_ISONOTE_TEXT_ADMISSION_EVIDENCE_V1
```

The deeply immutable evidence contains the evidence and policy identities, authority, exact limits, input kind, source name when applicable, byte and code-unit measurements, BOM status, delimiter, structural maxima, unique mapping count, total and retained warning counts, ordered diagnostics, and admission outcome.

Evidence never retains source text, byte arrays, parsed rows, mapping objects, PDF bytes, scan results, macro recipes, audit reports, or evidence-package payloads.

The operational admitted result separately carries the bounded source string and existing parser result needed by the application.

## UI integration and state preservation

Accepted sources atomically replace source text, source name, parser result, and admission evidence, then clear stale scan and audit artifacts. The existing mapping summary remains and a compact accessible metrics line reports rows, columns, mappings, and source bytes.

Policy-rejected file, paste, typed, or sample candidates update only the rejection message. They do not replace the last admitted source, clear its mappings, clear the PDF, begin scanning, hash mappings, create recipes, or mutate session state.

Source controls remain disabled during scanning, annotation, and evidence packaging.

## Compatibility

For inputs within V1 limits, ST-1 does not change accepted delimiters, header aliases, PS normalization, duplicate precedence, recipe semantics, mapping hashes, occurrence IDs, versioned markers, scan matching, audit identity, audit CSV or JSON schemas, post-write verification, evidence ZIP content, sample content, sample filenames, or sample MIME types.

No PDF output schema or audit schema changes are introduced.

## Validation

The final focused connected-runner gate passed:

- admission-policy identity, exact values, and deep immutability;
- file metadata and actual-byte boundaries;
- fatal UTF-8 decoding, BOM, multibyte, supplementary, malformed, truncated, overlong, and UTF-16 fixtures;
- quote-aware row, column, cell, CRLF, LF, delimiter, and Markdown-pipe measurements;
- semantic parser suppression after structural rejection;
- mapping-count boundaries;
- deterministic warning truncation and metadata-only evidence;
- accepted and rejected file, typed, pasted, and sample UI paths;
- preservation of prior source and PDF state after rejection;
- existing parser and sample compatibility;
- strict TypeScript and frontend lint;
- package and lockfile stability.

Temporary validation workflows and scripts were removed after successful execution. Complete repository certification is recorded on the final pull-request head.

## Explicit non-scope

ST-1 does not implement Phase 3B.3C JSON structural admission, Writer image admission, embedded round-trip project admission, OCR semantic quotas, global resident-memory accounting, annotation-placement redesign, or generic spreadsheet import.

It also does not add a worker, generalized text-admission framework, background parser, new dependency, UI settings, modal, or output-format change.
