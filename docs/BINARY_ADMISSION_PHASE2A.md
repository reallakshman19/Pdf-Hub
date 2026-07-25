# Binary Admission Phase 2A

## Donor-PDF Admission and Command-Boundary Enforcement

Baseline:

```text
main
4922d29812214c81c87e1bd50b9a3ee7d3dbfb38
```

## Scope

Phase 2A protects ordinary donor-PDF operations used by:

- Toolbar Organize merge;
- Toolbar Organize insert-pages;
- Toolbar Organize replace-page;
- thumbnail context-menu replace-page;
- the shared `MERGE_PDF`, `INSERT_PAGES`, and `REPLACE_PAGE` command runtime.

Macro batch aggregate policy, Writer and OCR imports, project archives, image admission,
resident-memory policy, and later Phase 2 work remain outside this phase.

## Admission pipeline

Picker-originated donor operations use the following sequence in selected-file order:

1. collect `File` metadata without reading bytes;
2. apply the existing per-file source limit;
3. reject incompatible PDF metadata before reading any selected donor;
4. read donors sequentially with cancellation checkpoints;
5. verify the `%PDF-` signature;
6. parse and validate a positive donor page count with cancellation checkpoints;
7. record deterministic per-input and aggregate evidence;
8. stage the complete donor set only after every donor passes;
9. verify cancellation, operation generation, and active-document identity immediately
   before command dispatch;
10. dispatch exactly one protected command.

Merge admission is all-or-nothing. No accepted subset is dispatched after another donor
fails.

## Runtime proof boundary

`AdmittedDonorPdf` is a metadata-only runtime capability. Canonical admitted bytes are
stored in a private `WeakMap` registry and are not carried in the public command object.
The command boundary verifies:

- registry provenance;
- command target;
- active-document identity;
- latest donor-operation generation;
- single consumption;
- donor-page range for replacement.

A fabricated object or a donor admitted for another command or document is rejected
before `PdfEditAdapter.merge`, `PdfEditAdapter.insertAt`, or
`PdfEditAdapter.replacePage` can execute.

Successful mutations continue to commit exclusively through
`commitDocumentMutation(...)`. Phase 2A introduces no transaction manager and does not
change annotation remapping, history insertion, undo/redo, rollback, or output
semantics.

## Policy authorities

Per donor PDF:

```text
Authority: EXISTING_SOURCE_POLICY
Source: FileAdapter.MAX_PDF_SIZE_BYTES
Value: 100 MiB
```

Aggregate source bytes are always measured as `AGGREGATE_SOURCE_BYTES`. Ordinary donor
commands have no owner-approved aggregate rejection threshold or global donor-file-count
ceiling. The evidence therefore records unresolved aggregate-policy provenance without
rejecting previously compatible donor sets. Macro runtime limits are not reused as
global command policy.

## Cancellation and staleness

Admission checks cancellation and staleness before and after every donor read, before and
after donor page counting, before staging, and immediately before dispatch. The command
runtime repeats document-identity and cancellation checks before PDF mutation and before
the existing transaction commit.

Replacement staging is cleared when its dialog closes, another donor operation
supersedes it, the active document changes, confirmation completes, or its owning UI
unmounts. Late completion cannot reopen the dialog or dispatch a command.

## Evidence

Donor evidence records:

- `profileId: DONOR_PDF`;
- policy version and authority;
- command target;
- stable input index and file name;
- per-file source bytes;
- aggregate source bytes;
- validated page count;
- deterministic diagnostics and outcomes.

The picker order is authoritative for admission, evidence, diagnostics, and merge order.
