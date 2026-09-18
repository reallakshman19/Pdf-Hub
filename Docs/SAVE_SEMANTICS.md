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

## Current implementation as of 2026-09-18

The current toolbar Save path calls:

`composeCommittedPdf()`

That function currently:
1. starts from `workingBytes`;
2. bakes Writer elements into the PDF;
3. calls `PdfEditAdapter.exportWithAnnotations()`;
4. produces new full PDF bytes.

The annotation export path currently draws annotation appearances into page content rather than serializing supported annotations as native PDF `/Annot` objects.

After Save, `ToolbarFile`:
- commits those new bytes as the working/original session state;
- clears the in-memory annotation overlay store;
- clears committed Writer elements.

Therefore **normal Save currently flattens application annotations**.

This is a known product-contract violation tracked by roadmap issue #167 and must be repaired in Phase 1.

## Required Phase 1 change

Split the writer paths conceptually into:

```text
saveEditablePdf()
  - preserve native annotation objects
  - preserve supported review metadata
  - bake only document content that is intentionally content

exportFlattenedPdf()
  - render/burn annotation appearances
  - render/burn overlays as required
  - never replace or clear editable state in the active session
```

Native PDF annotation support should cover common interoperable types where feasible:
- `/Text`
- `/Highlight`
- `/Underline`
- `/StrikeOut`
- `/FreeText`
- `/Ink`
- `/Square`
- `/Circle`
- `/Line`
- `/Stamp`

Appearance streams must be generated when needed for viewer compatibility.

## Save-state rule

A successful Save may clear application overlay state **only after** the equivalent editable state is durably represented in the saved PDF or another explicitly documented durable project format.

Do not clear editable annotation state merely because its visual appearance was burned into page content.

## Signatures

Structural/content changes may invalidate existing digital signatures.

Until signature-preserving/incremental-save behavior is implemented, saving a signed PDF must surface a clear warning rather than implying signature preservation.

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
