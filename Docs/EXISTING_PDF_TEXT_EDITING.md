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


## Content-stream provenance

The second Phase 13 slice remains **read-only**. It attempts to map an inspected `native-replacement-candidate` span to one specific decoded page content-stream operator.

This is intentionally much narrower than general PDF text editing.

### Complete content-stream requirement

`readExistingTextPageContentStreams()` reads the page's raw `/Contents` object directly and decodes each `PDFRawStream`. It deliberately does **not** call pdf-lib `normalizedEntries()`, because normalization can mutate the transient page structure and inject wrapper content streams.

A page is considered complete only when every content entry is a decodable raw stream. If any entry is direct/unsupported or cannot be decoded, provenance matching fails closed with `INCOMPLETE_CONTENT_STREAM_SET`.

The reader never saves the document, adds a content stream, writes a dictionary, or draws content.

### Simple operator subset

`scanExistingTextContentStream()` recognizes only a simple provenance subset built around:

- `BT` / `ET`;
- `Tf` for a known positive font size and resource name;
- an explicit simple `Tm`;
- a simple `Tj` text-show operator;
- ASCII-safe literal strings such as `(Hello)`;
- ASCII-safe hex strings such as `<48656C6C6F>`.

The scanner records:

- content stream index/reference;
- operator ordinal;
- exact operand byte range;
- exact `Tj` operator byte range;
- decoded ASCII text;
- font resource name;
- font size;
- text matrix.

### Fail-closed exclusions

The current provenance subset does not treat the following as native matches:

- `TJ` arrays;
- quote text-show operators;
- text positioned through `Td`, `TD` or `T*`;
- horizontal scaling, text rise or character/word spacing state;
- non-identity `cm` graphics transforms affecting the candidate;
- non-ASCII or font-encoded text bytes;
- malformed streams;
- Form XObject content;
- ambiguous duplicate operators.

After a `Tj`, a fresh explicit `Tm` is required before another candidate because this scanner deliberately does not calculate glyph advance.

### PDF.js span agreement

`matchExistingTextSpanToContentStream()` only considers spans already classified as `native-replacement-candidate`.

The span must also fit the stricter simple horizontal provenance subset: PDF.js horizontal/vertical text scales must agree with the observed font size, rotation/skew must be absent, and direction must be LTR/unspecified.

A source operator matches only when text, font size and origin agree within the declared tolerance. **Exactly one** candidate across the complete page stream set is required.

Zero candidates returns `NO_SIMPLE_TEXT_OPERATOR_MATCH`. Multiple candidates returns `AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH`.

This provenance is evidence for a later mutation investigation. It is not a write capability and still does not create a `REPLACE_EXISTING_TEXT` command.
