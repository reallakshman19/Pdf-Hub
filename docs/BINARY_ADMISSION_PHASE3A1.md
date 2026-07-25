# Phase 3A.1 — Atomic Standalone Writer Project Import

Baseline: `2c05be1b4baf00156a67f3349519c2cc569ec99b`.

The standalone `.pdfhub.zip` and `.zip` route now separates source classification,
ZIP-signature checking, compatibility decoding, semantic reconciliation, original
PDF validation, immutable staging, and coordinated commit. No Writer, session, or
editor state is changed before the staged capability is complete.

The commit boundary snapshots the exact Writer V2, session, and editor stores.
For PDF-overlay projects it activates the validated PDF session, hydrates the
matching Writer layer, and switches to write mode synchronously. For blank Writer
projects it clears the prior PDF session, hydrates the blank project, and switches
to write mode synchronously. If any commit step fails, all three store snapshots
are restored exactly before the error is returned.

Staged capabilities are registered by object identity, tied to one operation
generation, single-use, revocable, and release their protected payload after
commit or revocation. Fabricated, consumed, revoked, cancelled, unmounted, or
superseded capabilities are rejected before application-state mutation.

Manifest counts, document modes, IDs, asset references, original-PDF signature and
positive page count are reconciled before staging. Stale nested fingerprints remain
compatible and are normalized to the canonical manifest fingerprint with ordered
warnings. Existing OCR payload decoding is carried through staging but OCR store
state is not mutated.

No numeric ZIP source, entry-count, JSON, element, asset, or expansion policy is
introduced. These dimensions retain `UNRESOLVED_POLICY` provenance. The primary PDF
size policy and macro resource limits are not reused.

The editable round-trip `.pdf` branch remains a separate compatibility path and its
attachment traversal is unchanged. Phase 3B and later archive-bounding, embedded
round-trip, OCR admission, image admission, and structured-text work remain
deferred.

The final exact PR head must pass Frontend Certify, Frontend CI, Writer Overlay V2,
and the supported OCR/Writer compatibility certification commands. Temporary
workflows, triggers, logs, and generated diagnostics are not part of the final diff.
