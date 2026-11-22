# WP-07 R4 / WP-04 — Durable batch-output custody integration contract

**Status:** Bounded WP-07 implementation; not the complete WP-04 project recovery or export contract.

## Scope and storage boundary

WP-07 stores generated **batch** PDF bytes and their provenance in its own
versioned same-origin IndexedDB database, `pdf-hub-wp07-output-custody-v1`.
Schema v2 adds an append-only-per-output terminal receipt store, upgrading
existing v1 databases without dropping queued PDFs or batch reports.
This is deliberately separate from WP-04 document-history journals and the
Writer asset database. Existing non-batch macro and generator outputs are still
session-memory only until WP-04 and the generator owners agree a shared
admission/recovery format.

Batch rows include a stable UUID, batch run ID, exact source picker index,
source SHA-256, recipe ID and SHA-256, per-output index/kind, output SHA-256,
safe output filename, original auxiliary label and PDF bytes. The metadata-only
latest batch report is a separate store in the same database.

## Commit and recovery invariants

1. One batch input's working PDF and all auxiliary PDFs are **one IndexedDB
   readwrite transaction**. Every output SHA-256 is independently checked
   before writing. The queue publishes the group only **after transaction
   completion**.
2. On reload the queue reads stored bytes and metadata and recomputes output
   SHA-256 before displaying them. Invalid, duplicate or tampered custody
   records block recovery; no corrupted bytes are silently relabeled valid or
   deleted.
3. On successful native File System Access save, the app reads back the file
   and matches SHA-256 before acknowledging. The receipt includes output
   identity, recorded timestamp, returned external filename and readback SHA.
   A browser download is *not* considered receipt; only explicit user
   confirmation acknowledges it, with a distinct `browser-user-confirmed`
   method and no fabricated readback claim.
4. Acknowledgement inserts the terminal receipt record **and** deletes the
   queued PDF in one IndexedDB transaction, awaiting commit before hiding the
   file. A failed transaction retains its bytes; no partial receipt is issued.
   An interrupted save may require the user to reconcile an already-written
   external file, but must never lose the in-browser copy.
5. A destructive Clear requires a separate explicit confirmation and
   atomically retains `discarded-without-receipt` tombstones for batch PDFs,
   distinguishable from verified native saves and user-confirmed downloads.
   The UI exposes the retained terminal ledger even after the last PDF leaves
   the queue. Neither native browser file paths nor user-download OS receipts
   can be inferred from these records.
6. A failed storage transaction, quota problem or malformed record blocks
   in-browser custody and is reported explicitly. This is fail-closed, not an
   ephemeral-mode success claim.
7. If IndexedDB is missing, the in-memory test/compatibility adapter identifies
   itself as **volatile**. The UI must not claim reload durability.

## What R4 does *not* guarantee

- IndexedDB is browser-local and can be cleared by users, browser privacy
  policies, site-data clearing or storage eviction. It is not an archival
  destination, offline backup or externally verified durable receipt.
- In-session atomicity is not atomicity across **multiple external PDF files**
  saved by the user. Each file must be saved and acknowledged separately.
- Cross-tab coordination and multi-device synchronization are not established.
- The ledger records terminal disposition and provenance; it does not yet
  provide a durable history of every failed attempt/retry or prove long-term
  retention against site-data eviction. A browser user-confirmed download is
  an assertion, not an OS-level readback verification.
- WP-04 project archives do not yet include batch output rows. WP-04 needs to
  decide whether these remain separate recoverable artifacts or become linked
  entries in its native project manifest, with a versioned migration and
  explicit user opt-in.
- Current B03 extract paths are certified on synthetic native-PDF fixtures.
  Authentic engineering PDF corpora, large-file benchmarks and independent
  reviewer acceptance remain separate release gates.

## WP-04 integration deliverable requested

WP-04 should provide a read-only native-project association contract (e.g.
document fingerprint, canonical PageId mapping and exportable artifact
reference) **without overwriting or reinterpreting** the WP-07 output hash,
source ordinal, output index or receipt state. Any eventual import/export
migration must preserve original hashes and fail on mismatch, not manufacture
a new source identity from filename alone.

## Required acceptance challenge

- A 3-page input generates one working PDF and one auxiliary PDF.
- Reload restores both PDFs and metadata report without rerunning the recipe.
- Saving/confirming only the first survives another reload with exactly one
  queued auxiliary and no duplicate first output.
- File System Access write succeeds but readback differs: queue remains intact.
- IndexedDB quota or transaction rejection: no partially published group.
- Corrupted stored PDF hash: recovery blocked with bytes still in storage.
- Browser download initiation alone: queued until explicit confirmation.
- After native readback, reload must restore the terminal receipt even though
  the output bytes were retired. Forged readback digest must reject.
- First Clear click must leave all queued bytes intact; only a second explicit
  discard action can remove them, leaving durable tombstones.
- Full repository CI, independent review, and merge/deploy authority remain
  separate mandatory gates.
