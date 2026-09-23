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

The current native annotation writer preserves the supported PDF-native annotation model, including stable managed `/NM` names, reply `/IRT` relationships, and review state as separate linked Text annotations carrying string-valued `/StateModel Review` plus `/State`. Review state is not written onto the visual/root annotation. Existing Review state-transition annotations are preserved, including legacy/imported state-to-state IRT chains. New PDF Hub Review state annotations follow the current ISO contract and point directly to the original review annotation. A no-op PDF Hub save does not collapse or append state history; a genuine application status change appends a new direct-root transition.

PDF Review state is author-specific, while the current PDF Hub application model exposes one thread status. PDF Hub therefore preserves all native Review-state chains in the file but projects the latest observable Review transition into the single application status, using native timestamps with annotation order as a deterministic fallback. The projected transition author is retained separately as `review.statusAuthor`: imported native states take it from the state annotation's `/T`, and local status actions default to `Current User`. New native state transitions use that transition actor and refer directly to the original review annotation; the original thread author is not silently reused as the actor of a later decision. Parallel author-specific states are preserved in the PDF but are not yet surfaced as separate UI statuses.

Phase 10 interoperability tests exercise repeated-save identity/topology continuity, standards-only re-import after `PDFHub*` metadata removal, external native-field precedence, nested `RT=R` reply ancestry, and preservation/relinking of Review-state objects attached to replies. The UI may present replies as a flat list, but persistence retains each nested reply's logical parent as `parentReplyId`; reply-attached state never silently becomes the root thread's review status.

When PDF Hub rewrites a managed root or reply, it owns only the fields represented by the supported annotation model. Other standard, extension, and vendor dictionary entries are copied forward. Recognized standard fields override stale private `PDFHubData` on import, including FreeText `/DA` and text-markup `/QuadPoints`. FreeText `/DA` projects native font size and text color into application state; an unchanged external DA object is reused exactly, while supported local typography edits rewrite the size/color operators without replacing the external font resource token. Text-markup `/QuadPoints` are projected as Rect-normalized `textMarkupQuads`, preserving multi-quad geometry while allowing a local move/resize to regenerate scaled PDF-space quads.

An externally generated `/AP` is copied forward when PDF Hub's appearance-driving native fields are semantically unchanged. If a PDF Hub edit changes those owned appearance fields—including `/DA`, `/Rect`, or `/QuadPoints`—the old `/AP` is omitted rather than retained as a stale appearance that could override the edit.

Native annotation rich text is a separate fidelity boundary. When a markup annotation or represented review reply contains standard `/RC` rich text, PDF Hub classifies that content as `NATIVE_PRESERVED_READ_ONLY`. FreeText `/DS` is preserved with the rich-text object. PDF Hub may display the native flat `/Contents` counterpart, but it does not claim to edit arbitrary rich-text/XHTML semantics. Type conversion, plain-text edits, typography edits, copy/duplicate, and manual cross-page reassignment are therefore blocked for the affected native semantics. Geometry, border, opacity, review state, thread operations, and other independently representable edits remain available.

The native writer is the final backstop: if a caller bypasses the application guard and changes protected rich-text semantics, or attempts to write a copied rich-text annotation without the original `/RC` source object, Save fails with `NATIVE_RICH_TEXT_EDIT_UNSUPPORTED` rather than writing contradictory `/RC` and `/Contents`. On a semantic no-op, source `/Contents`, `/RC`, FreeText `/DS`, `/DA`, and `/Q` are preserved. An allowed geometry or border edit retains rich text but invalidates stale `/AP` through the normal appearance-equivalence rule. Rich-text review replies follow the same rule independently from their root thread: their native content cannot be edited or removed through a lossy application projection, and cloning a thread that depends on a rich-text reply is blocked until the native reply can be cloned losslessly.

Phase 10 also enforces writer/reader symmetry for every standard field declared by the supported annotation fixtures. Standard `/F` lock state, border width/style (`/BS` taking precedence over `/Border` when present), FreeText `/Q`, Text `/Open`, stamp `/Name`, and Line `/LE` are projected into the existing application model and override stale private cache values. Standard subtype disambiguators such as FreeText `/IT` or `/CL`, Square `/BE`, and Line `/LE` take precedence over stale `PDFHubType` where the PDF standard representation resolves the type. Native values that PDF Hub does not expose as editable UI semantics—such as a custom Text icon name, a custom stamp name, a cloud border-effect intensity, or an unsupported line-ending name—are copied forward on a semantic no-op instead of being normalized away. Annotation `/F` handling changes only the Locked bit represented by PDF Hub and preserves all other external flag bits.

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
