# PDF Hub — Save and Export Semantics

> **Authoritative save/export contract.**
>
> This document distinguishes the current implementation from the target product contract. Tests and future refactors should use this file rather than historical save/export work-item notes.

## Target product contract

| Action | File result | Active document | Editable annotations |
|---|---|---|---|
| **Save** | Writes current document to the active file | Remains active | Preserved when representable as PDF-native annotations |
| **Save As** | Writes current document to a new file | New file becomes active | Preserved |
| **Export Flattened** | Creates a separate flattened PDF | Unchanged | Flattened in exported copy only |
| **Export Review** | Creates a configured review copy | Unchanged | Depends on explicit review-export option; must never silently alter the active document |
| **Export Searchable PDF** | Creates PDF with OCR text layer | Unchanged unless user explicitly chooses to replace active document | OCR layer embedded |
| **Download Current PDF** | Downloads current PDF representation | Unchanged | Must be clearly defined by the calling surface |

## Critical rule

**Save must not silently mean Flatten.**

Editable annotations/comments and a flattened visual export are different product outcomes and must remain separate actions.

## Current implementation as of 2026-09-22

The toolbar normal Save path calls:

`composeEditablePdf()`

That path:
1. starts from the active `workingBytes`;
2. commits Writer elements as document content;
3. serializes supported application annotations as editable native PDF `/Annot` objects;
4. returns new full PDF bytes for Save/Save As.

Explicit flattened exports use `composeCommittedPdf()` instead. Normal Save therefore remains semantically distinct from Export Flattened.

The current native annotation writer preserves the supported PDF-native annotation model, including stable managed `/NM` names, reply `/IRT` relationships, and review state as separate linked Text annotations carrying string-valued `/StateModel Review` plus `/State`. Review state is not written onto the visual/root annotation. Existing Review state-transition annotations are preserved: the first transition points to the review root, and subsequent same-author transitions may point to the previous state annotation. A no-op PDF Hub save does not collapse or append state history; a genuine application status change appends a new transition.

PDF Review state is author-specific, while the current PDF Hub application model exposes one thread status. PDF Hub therefore preserves all native Review-state chains in the file but projects the latest observable Review transition into the single application status, using native timestamps with annotation order as a deterministic fallback. The projected transition author is retained separately as `review.statusAuthor`: imported native states take it from the state annotation's `/T`, and local status actions default to `Current User`. New native state transitions use that transition actor and chain only to that actor's previous state; the original thread author is not silently reused as the actor of a later decision. Parallel author-specific states are preserved in the PDF but are not yet surfaced as separate UI statuses.

Phase 10 interoperability tests exercise repeated-save identity/topology continuity, chained state-history preservation, standards-only re-import after `PDFHub*` metadata removal, and external native-field precedence.

Normal Save still rewrites PDF bytes rather than providing a signature-preserving incremental update contract. Signed-PDF risk is therefore handled by an explicit preflight warning, described below.

## Save-state rule

A successful Save may clear application overlay state **only after** the equivalent editable state is durably represented in the saved PDF or another explicitly documented durable project format.

Do not clear editable annotation state merely because its visual appearance was burned into page content.

## Signatures

Structural/content changes may invalidate existing digital signatures.

Before normal Save/Save As, PDF Hub inspects the current PDF for an applied signature structure on the supported pdf-lib surface. The detector requires a meaningful `/ByteRange` plus non-zero signature `/Contents`; an empty `/Sig` form field by itself is not treated as an applied signature.

When an applied signature is detected, Save pauses before PDF composition or file write and warns that PDF Hub rewrites the file and **does not currently preserve signature validity**. If signature state cannot be determined on the supported parser surface, Save also pauses and surfaces that uncertainty instead of silently proceeding. In either case, the user may cancel with no Save write side effects or explicitly choose **Save Anyway**.

This is rewrite-risk detection, not cryptographic validation. PDF Hub does not claim that an existing signature remains valid after Save/Save As, does not treat an unknown signature state as unsigned, and does not yet implement signature-preserving incremental writes.

## Testing contract

For Save:
1. create supported editable annotation;
2. save;
3. reopen produced PDF;
4. verify annotation remains semantically present/editable;
5. save again;
6. reopen again.

For Export Flattened:
1. create editable annotation;
2. export flattened;
3. verify visual appearance exists in export;
4. verify active session still retains editable annotation;
5. verify exported copy does not depend on PDF Hub state to display the markup.

Historical files that state Save/Export behavior differently are not authoritative.
