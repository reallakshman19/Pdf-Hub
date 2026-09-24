# Existing PDF Text Editing

Status: **Phase 13 — foundation active**

PDF Hub distinguishes text that already exists in an imported PDF from Writer overlay text, OCR output, annotations, and newly drawn PDF text.

The first Phase 13 production slice is intentionally **inspection and provenance only**. It does not claim native text mutation yet.

## Why this boundary exists

PDF text is a sequence of drawing operations using font resources, encodings, text matrices and content streams. A PDF.js text item is useful evidence about rendered text, but it is not automatically a reversible pointer to one safe source operator.

PDF Hub therefore does not treat every extracted string as a word-processor run.

## Source metadata

`PdfRendererAdapter.getPageExistingTextSourceItems()` preserves scale-independent PDF.js source metadata:

- source item index;
- text;
- raw six-value text transform;
- width and height;
- PDF.js font identity when available;
- writing direction;
- end-of-line state.

This path is separate from the existing zoom-oriented text-layer geometry used for viewing/search.

## Revision-bound span identity

Canonical existing-text spans are bound to:

- active revision ID;
- stable PageId;
- PDF.js source item index.

The current physical `pageIndex` is retained only as a coordinate. It is not part of the span ID.

A span ID may remain the same when the same PageId moves to another physical index, but a new document revision produces a different span identity. This prevents a text selection from silently surviving arbitrary byte mutations.

## Editability classification

Every inspected span is classified as exactly one of:

### `native-replacement-candidate`

A simple horizontal span with finite geometry, positive text scale/advance and PDF.js font identity.

This classification means the span is eligible for the next native-replacement investigation. It **does not mean mutation-ready** and does not prove that PDF Hub can safely reuse the original embedded font or map the item to one content-stream operator.

### `reconstructed-candidate`

The text remains inspectable but native replacement has unresolved source constraints. Current downgrade reasons include:

- missing font identity;
- vertical writing mode;
- rotation;
- skew/shear.

A later reconstructed fallback must prove visual preconditions before it can be presented as an edit. Phase 13 does not treat mask-and-redraw as equivalent native editing.

### `unsupported`

The source item fails closed because it is blank or structurally unsafe, such as non-finite geometry, invalid source index, non-positive advance, or non-positive text scale.

Unsupported spans cannot create edit intents.

## Edit intent

`ExistingTextEditIntent` is a revision-bound contract for a future mutation step. It records:

- source revision ID;
- PageId;
- span ID;
- source item index;
- expected source text;
- replacement text;
- the source editability classification observed when the intent was created.

Before a later mutation executes, the intent can be compared against a freshly inspected span with `validateExistingTextEditIntentAgainstSpan()`.

This is the stale-selection barrier: a changed revision, PageId, span ID, source index, expected text or classification invalidates the prior intent.

An empty replacement string is allowed so future bounded mutation may support deletion. NUL characters are rejected.

## What is deliberately not implemented yet

This first slice does **not** add:

- a `REPLACE_EXISTING_TEXT` canonical command;
- a PDF mutation-session text replacement method;
- content-stream rewriting;
- original embedded-font reuse;
- reflow across adjacent source items;
- OCR-text mutation;
- Writer conversion;
- a visual mask-and-redraw fallback;
- an editor UI that claims reconstructed/unsupported text is natively editable.

The next Phase 13 slice should investigate the smallest content-stream subset where provenance can be proven and save/reopen fidelity can be tested. Only then should a canonical mutation command be added.
