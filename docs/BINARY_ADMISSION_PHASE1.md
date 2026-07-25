# Binary Admission Phase 1 — Foundation

## Status

This phase starts the centralized binary-admission program without choosing or
silently inheriting unresolved numerical limits.

PR #132 remains a separate dependency. This foundation does not modify its
render scheduler, concurrency ceiling, bitmap cache, lease ownership, stale
result suppression, or cleanup paths.

## Scope

Phase 1 introduces pure TypeScript building blocks for:

- canonical admission profiles and outcome categories;
- explicit, versioned policy objects with no implicit numerical defaults;
- deterministic diagnostic ordering;
- metric evaluation that fails visibly when a required limit is unconfigured;
- archive path validation and canonical collision detection;
- operation-generation and cancellation gates around the future state commit;
- deterministic staged cleanup for rejected, failed, or cancelled work.

No production file picker, PDF parser, ZIP extractor, image decoder, Writer
store, OCR store, renderer cache, or persistence path is rewired in this phase.

## Why the phase is intentionally non-invasive

The repository does not yet contain owner-approved values for PDF, image,
archive, JSON, OCR, Writer, aggregate, or peak-resident limits. Wiring an
admission service into production before those values are authorized would
create either silent unlimited acceptance or invented policy.

The foundation therefore requires callers to supply an explicit policy version
and explicit limits. Missing required limits produce
`POLICY_LIMIT_UNCONFIGURED`; they do not fall back to the existing picker-local
100 MiB value.

## Archive path model

The path reconciler:

1. preserves the raw input path for evidence;
2. rejects empty, absolute, drive-qualified, control-character, dot, and parent
   traversal paths;
3. normalizes `\\` to `/` for canonical comparison;
4. detects duplicate canonical paths;
5. distinguishes file/file collisions from file/directory collisions;
6. applies case and Unicode comparison only through explicit policy settings;
7. orders diagnostics by input index and validation phase.

It does not claim that JSZip has already provided every original central-
directory record. A later archive-inspection phase must preserve raw records
before JSZip map replacement or path sanitization can hide duplicates.

## Commit boundary

`AdmissionOperationGate` is a local transaction guard for future orchestration.
It requires:

- a non-empty operation ID;
- a monotonic generation supplied by the caller;
- successful validation before commit;
- generation equality immediately before mutation;
- a final abort check immediately before the synchronous mutation;
- one-shot, reverse-order staged cleanup.

This is not a replacement for IndexedDB transactions or existing PDF-operation
cancellation. It prevents late asynchronous results from receiving permission
to mutate state.

## Deferred production work

The next authorized phase must:

- merge and certify PR #132 from its exact head;
- receive owner-approved policy values and compatibility behavior;
- inspect raw ZIP central-directory records;
- prove bounded decompression or replace the current extraction stack;
- add bounded PDF, JSON, image, OCR, and aggregate measurement;
- integrate all picker, drop, clipboard, project, Writer, and OCR entry points;
- stage complete imports before a single content-state commit;
- add browser resource and adversarial fixture certification.

## Required checks

```text
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

The full repository certification matrix remains required before merge.
