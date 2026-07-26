# Binary Admission Phase 3B.3A

## Static Writer Project Member Profile Admission

## Exact baseline

```text
PHASE_3B3A_BASELINE
9761d1ebc3314e091fc2d5a2fb182bd122a46933
```

The baseline is the exact Phase 3B.2 squash merge commit. Phase 3B.1 remains authoritative for ZIP path decoding, normalization, collisions, directory identity, structural support, and central-directory ordinal evidence. Phase 3B.2 remains authoritative for declared-resource admission and bounded extraction.

## Profile identity and authority

```text
Profile:   WRITER_PROJECT_MEMBER_PROFILE_V1
Authority: OWNER_APPROVED
```

The production route uses the closed V1 profile. It is deeply immutable and is not configurable through environment variables, storage, URL state, UI state, or ordinary production callers.

## Required root members

These exact, case-sensitive root regular files are required:

```text
manifest.json
writer-elements.json
writer-assets.json
```

A directory entry, normalized alias, case variant, nested path, or other spelling does not satisfy a required role. Required-role checks occur after ordinal member classification and in the order shown above.

## Optional root members

These exact, case-sensitive root regular files are admitted but not required:

```text
original.pdf
writer-document-meta.json
```

Static admission does not decide whether `original.pdf` is required for a particular document mode. Existing manifest and Writer semantic validation retain that responsibility.

## Asset namespace

The admitted asset namespace is:

```text
assets/<leaf-name>
```

Rules:

- `assets/` is the exact optional directory marker;
- asset files must be direct regular-file children of `assets/`;
- leaf names must be non-empty and must not be `.` or `..` after trimming;
- nested descendants, repeated separators, case variants, and similar namespace names are rejected;
- admitted asset files are not checked for MIME type, extension, asset ID, references, or use.

## Exact OCR compatibility catalog

The finite V1 OCR catalog is derived from the current OCR project codec:

```text
ocr/manifest.json
ocr/result.json
ocr/corrections.json
ocr/regions.json
ocr/writer-insertion-queue.json
```

The exact optional OCR directory marker is:

```text
ocr/
```

Absence of OCR members remains valid. A partial set may pass static member admission when every present path is in the catalog. Existing OCR semantic parsing remains responsible for required relationships and payload interpretation.

No wildcard such as `ocr/**` is used. Unknown, nested, or incorrectly cased OCR paths are rejected before extraction.

## Directory-marker policy

Only these exact decoded directory markers are admitted:

```text
assets/
ocr/
```

They correspond to the current asset namespace and the exact parent directory of current OCR members. Directory entries such as `debug/`, `backup/`, `temp/`, `project/`, and `__MACOSX/` are rejected. Directory entries never satisfy regular-file roles.

## Exact path evidence

Admission consumes the immutable Phase 3B.1 inventory and does not build a second ZIP path parser.

Classification uses:

- the Phase 3B.1 decoded filename for exact spelling and separator identity;
- the Phase 3B.1 normalized filename for retained evidence;
- the Phase 3B.1 directory flag for member-kind checks;
- the Phase 3B.1 central-directory ordinal for deterministic ordering.

This prevents normalized aliases such as `./manifest.json` or backslash variants from satisfying an exact profile role.

## Classifications and unknown-member rejection

Every processed member receives exactly one classification:

```text
REQUIRED_ROOT_MEMBER
OPTIONAL_ROOT_MEMBER
ASSET_DIRECTORY
ASSET_MEMBER
OCR_DIRECTORY
OCR_COMPATIBILITY_MEMBER
UNKNOWN_MEMBER
```

Any `UNKNOWN_MEMBER` causes archive rejection before bounded extraction. Unknown payloads are not ignored, preserved, decompressed, or exposed through a user override.

Invalid direct-asset placement, unknown OCR paths, unexpected directories, missing required members, and member-kind mismatches receive distinct deterministic outcomes.

## Admission order

The production route is:

```text
Phase 3B.1 structural inventory and admission
→ Phase 3B.2 complete declared-resource admission
→ Phase 3B.3A static member-profile admission
→ Phase 3B.2 sequential bounded extraction
→ existing Writer/OCR semantic decoding
→ Phase 3A.1 reconciliation, staging, and commit
```

Static member admission evaluates:

```text
profile identity
→ members in central-directory ordinal order
→ first invalid placement determines the archive outcome
→ required roles in manifest/elements/assets order
→ immutable admitted member inventory and evidence
```

No member bytes are read or inflated during this gate.

## Cancellation and supersession

The existing standalone operation identity, generation, `AbortSignal`, `isMounted()`, and `isCurrent()` contract is checked:

- before member admission;
- before and after each ordinal classification;
- after classification;
- after required-role verification;
- again in the controller before bounded extraction.

A cancelled, unmounted, or stale operation does not start extraction or semantic decoding.

## Evidence contract

```text
WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_V1
```

Immutable evidence contains:

- member profile ID and authority;
- source structural profile and outcome;
- source Phase 3B.2 extraction-policy profile;
- raw entry count;
- member records in central-directory ordinal order;
- decoded and normalized path evidence;
- directory flag, classification, optional role, and member outcome;
- classification counts;
- required and optional role status;
- asset, OCR, and unknown counts;
- ordered diagnostics;
- archive admission outcome and cancellation stage.

Evidence contains no member payload bytes and no parsed JSON.

The admitted evidence is attached to the standalone Writer project import evidence before staging.

## Compatibility

Focused compatibility coverage uses current exporter output for:

- blank Writer projects;
- PDF-overlay projects;
- asset-bearing projects;
- OCR-free projects;
- OCR-bearing projects.

The profile contains only names emitted or read by the current Writer and OCR codecs.

## Explicit limitations

Phase 3B.3A admits static archive member identities and namespaces.

It does not parse or bound JSON, reconcile manifest references,
validate asset use, or provide OCR semantic admission.

This increment does not add:

- JSON byte, depth, node, token, or retained-object limits;
- manifest field validation changes;
- manifest-to-member or asset-reference reconciliation;
- Writer element-count or asset-count limits;
- embedded round-trip PDF admission;
- OCR semantic admission, execution, hydration, or schema changes;
- image-content or structured-text admission;
- ZIP export-format changes;
- global browser-memory accounting;
- Phase 3B.3B, Phase 3B.3C, Phase 3C, or later work.
