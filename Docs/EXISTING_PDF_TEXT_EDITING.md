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


## Bounded native replacement

The third Phase 13 slice introduces the first **actual content-stream write path**, but only for the exact simple provenance subset described above.

This is not general PDF text editing.

### Required stale/provenance checks

`replaceSimpleExistingTextTj()` requires the current revision ID, inspected span, revision-bound edit intent and matched provenance record together.

Before loading/writing the PDF it requires the current revision to equal the intent source revision and revalidates the intent against the span.

After loading the current bytes it locates the same content stream and rescans the decoded bytes. The exact stream ref/index, operator ordinal, operand/operator byte ranges, source text, representation, font resource, font size and text matrix must still match the provenance record. Drift fails closed.

### Font/encoding subset

Native replacement is currently limited to Type1 Latin **Standard-14** resources from the Helvetica, Times and Courier families with an explicit `WinAnsiEncoding`.

Symbol, ZapfDingbats, custom BaseFonts, Type0/CID/Type3 fonts and non-WinAnsi encodings are rejected.

Replacement text is further restricted to printable ASCII U+0020..U+007E, which is byte-compatible with the admitted WinAnsi subset.

### Operand preservation

The source representation family is preserved:

- an ASCII literal `Tj` remains a literal string, with `\\`, `(` and `)` escaped;
- an ASCII hex `Tj` remains an uppercase two-digit hex string.

Only the decoded operand byte range is replaced. The decoded bytes before and after the operand are required to remain byte-identical and are reported in the replacement proof.

### Stream/topology preservation

The target stream is rebuilt as FlateDecode after replacement. Passive original stream dictionary entries are copied, while stale compression/length entries such as `Length`, `Filter`, `DecodeParms` and `DL` are regenerated or omitted.

When the target is indirect, pdf-lib `context.assign()` preserves the same stream reference. Direct array entries are replaced in the existing array. Single-vs-array and direct-vs-indirect `/Contents` topology is therefore preserved for the admitted subset.

If a page `/Contents` array ref or target stream ref is shared by multiple pages/content entries, replacement is rejected rather than changing more than one page.

In other words, a **shared content stream** is not an admitted native-replacement target in this subset.

### Save/reopen semantics

Focused fidelity tests generate a PDF with a Standard-14 Helvetica text operator, map its provenance, replace `Hello` with `World`, save the PDF, reopen its content streams and require the replacement operator to expose `World` and no longer expose `Hello`.

The tests also cover stale intents, provenance drift, non-ASCII replacement, Symbol fonts, non-WinAnsi encoding, passive stream dictionary preservation and shared stream rejection.

### Layout limitation

This operation **does not reflow** neighboring PDF content and does not guarantee that the replacement has the same rendered width. Longer text can overlap adjacent content.

Fit policy, width diagnostics, reconstructed fallback and UI disclosure remain later Phase 13 work.

A canonical `REPLACE_EXISTING_TEXT` command is still intentionally absent until this bounded writer has executable fidelity evidence and is integrated through the normal transaction/history path.


## Canonical command and history integration

The fourth Phase 13 slice promotes the bounded writer into the canonical mutation architecture with `REPLACE_EXISTING_TEXT` schema version 1.

The command payload is self-contained and records the inspected span, revision-bound edit intent, and exact simple-`Tj` provenance. The command `documentKey`, span revision, and intent source revision must agree.

Execution follows the normal product path:

```text
CommandBus
  -> dispatchPdfCommand
  -> PdfMutationSession.replaceExistingText(...)
  -> PdfMutationSession.commit()
  -> commitDocumentMutation()
  -> immutable revision + history/journal
```

The dispatcher does not call the standalone writer directly.

Before mutation, the active PageGraph must still contain the span's stable PageId at the recorded physical page index. The mutation session then applies the same unique page-wide provenance rematch, exact operator rescan, Standard-14/WinAnsi admission, shared-stream rejection, and byte-range replacement rules defined above.

The page count and PageGraph topology are preserved. `DocumentTransaction` rekeys the unchanged stable PageIds to the new document revision. OCR state anchored to the edited PageId is invalidated because its recognized text may no longer match the PDF content.

### History and recovery

`REPLACE_EXISTING_TEXT` is classified as `SELF_CONTAINED_REPLAY`.

This is safe for the bounded command because durable recovery first installs the exact before-revision recorded by the journal. Canonical dispatch then reruns the command against those exact bytes, and recovery still verifies the resulting revision against the authoritative stored after-revision.

The command does not depend on an external binary resource, donor, locale, filename, or current-time context.

### Public SDK

Public SDK API version 1 advertises `REPLACE_EXISTING_TEXT` as a supported canonical command. SDK callers provide the same typed command payload and execution still routes through CommandBus. No content-stream writer, pdf-lib document, or mutation session is exposed to the SDK.

### Still not exposed in UI

This slice adds no end-user editing UI and still makes no automatic reflow or width-fit guarantee. Those presentation/policy concerns remain downstream Phase 13 work.


## Native layout-fit gate

Native simple-`Tj` replacement is now layout-gated in addition to being provenance/font/encoding-gated.

The source span's PDF.js `advanceWidthPt` is the authoritative observed occupied advance. The admitted Standard-14 BaseFont is measured with pdf-lib font metrics in a separate temporary measurement document; the active mutation document is not modified by measurement.

For source metric width `S`, replacement metric width `R`, and observed source advance `A`:

```text
observedToMetricScale = A / S
projectedReplacementAdvance = R * observedToMetricScale
```

This preserves the accepted source text-matrix scale while avoiding a character-count heuristic.

Native replacement is admitted only when:

```text
projectedReplacementAdvance
  <= observed source advance + 0.25 pt numeric tolerance
```

The tolerance is only for metric/rounding noise. It is not permission to consume adjacent whitespace.

If the metric is unmeasurable, native replacement fails closed with `NATIVE_FIT_UNMEASURABLE`. If the projected replacement is wider, it fails with `NATIVE_REPLACEMENT_OVERFLOW`.

The fit diagnostic is retained in the replacement proof, including:
- observed advance;
- measured source/replacement Standard-14 widths;
- observed-to-metric scale;
- projected replacement advance;
- tolerance;
- overflow.

A failed fit check occurs before the decoded operand byte range is rewritten.

## Reconstructed-overlay policy contract

A `reconstructed-candidate` is still not executable editing authority.

Phase 13 defines a pure policy result with three outcomes:

```text
native-replacement
future-reconstructed-overlay-candidate
blocked
```

The second outcome is intentionally named **future**: this phase does not add a visual-mask/redraw command, Writer fallback, or UI action.

A future overlay candidate requires versioned evidence bound to the same:
- source revision;
- PageId;
- span ID.

The evidence must state that:
- source coverage is proved;
- the clearance region has a known solid background color;
- there are zero foreign-paint intersections;
- proposed replacement bounds are finite, positive, and fully contained by the proved clearance region.

Missing, stale, incomplete, intersecting, or geometrically insufficient evidence remains blocked.

Native overflow may be reclassified only as a **future reconstructed-overlay candidate** when that same complete evidence exists. The canonical `REPLACE_EXISTING_TEXT` command itself remains native-only and never silently falls back.

### Evidence producer boundary

This slice does not implement the producer that proves source coverage, background, foreign paint, or replacement render bounds.

A later analyzer must produce those facts from page rendering/content evidence. A later executor must revalidate them at the active revision before any mask/redraw mutation exists.

Therefore this policy is an eligibility contract, not mutation authority.

### Still not exposed in UI

No Phase 13 component in this slice exposes native replacement or reconstructed fallback to end users. Layout-fit diagnostics and policy are production-core inputs for the next analyzer/UI slice.


## Read-only visual-clearance evidence producer

Phase 13 now includes a deliberately narrow producer for the reconstructed-overlay evidence contract.

This producer is **read-only**. It does not draw masks, add text, write history, publish revisions, or expose a UI action.

### Admitted proof subset

The first producer only analyzes a span that is still a `native-replacement-candidate` with exact simple-`Tj` provenance and whose recomputed Standard-14 fit result is `overflows`.

The page must have exactly one decoded content stream.

The admitted paint program is intentionally tiny:
- one explicit solid DeviceRGB or DeviceGray rectangle fill;
- that rectangle is painted before the target text;
- the exact target `Tj` is the only text-show paint;
- relevant `cm` transforms are identity;
- no other path paint, image/Form XObject, shading, clipping, transparency/ext-gstate, inline image, or extra text show is present.

Any operator outside the admitted proof grammar fails closed.

### Clearance geometry

For the horizontal simple-text subset, the analyzer derives a conservative vertical envelope around the text baseline.

The horizontal source bounds use the PDF.js-observed source advance. Replacement bounds use the recomputed projected Standard-14 replacement advance from the fit diagnostic.

The clearance rectangle is the union-width envelope anchored at the same text origin.

The explicit background rectangle must contain this full clearance rectangle. The producer does not infer adjacent whitespace merely because it is visually empty.

### Evidence meaning

When proof succeeds, the emitted `ExistingTextReconstructedOverlayEvidence` is bound to the same:
- source revision;
- PageId;
- span ID.

It records:
- `sourceCoverage: 'proved'`;
- the conservative clearance rectangle;
- the proved solid background color;
- `foreignPaintIntersections: 0`;
- the proposed replacement bounds.

The stricter execution proof also records the effective target text fill color. The admitted graphics-state default is black, and explicit DeviceGray / DeviceRGB fill changes are tracked through `q` / `Q`; reconstruction never guesses a text color.

The zero foreign-paint count is justified by the entire admitted paint program, not by raster sampling.

### Important limitation

This producer does **not** prove generic `reconstructed-candidate` spans. Those spans lack the exact source-paint provenance required by this first analyzer and remain blocked.

It also does not traverse Form XObjects or interpret arbitrary paths/images/transparency.

The reconstructed executor must revalidate the evidence against the active revision before mutation, revalidating the complete proof against the exact `PDFDocument` owned by the active mutation session immediately before mutation. Cached Inspector evidence is never write authority.


## Minimal Inspector UI

Phase 13 now exposes the bounded existing-text core through an Inspector **PDF text** tab.

The tab is intentionally page-scoped and proof-driven:
- it inspects PDF.js text spans only on the current physical page;
- spans are rebuilt with the active document revision and stable PageId;
- the user can double-click an inspectable rendered text item on desktop, tap it on touch devices when no browser text range is active, or select a span from the Inspector;
- page selection and Inspector selection synchronize through revision + PageId + PDF.js source index;
- the user enters replacement text;
- **Check edit** reruns exact current simple-`Tj` provenance and consumes the native-fit / visual-clearance analysis;
- no capability is inferred from character count, visual appearance, or stale inspection state.

The UI reports exactly three capability classes:

```text
native replacement available
fallback evidence proved
editing unavailable
```

### Native replacement

When the canonical analysis proves a fitting native edit, the UI enables **Replace existing text**.

That button creates the normal `REPLACE_EXISTING_TEXT` command and routes it through `CommandBus`. It does not call the pdf-lib writer, mutation session, or DocumentTransaction directly.

A successful command updates the normal session/history revision, which causes the page text inspection to refresh against the new document key.

A failed or stale command is surfaced as an error and is not reported as successful.

### Fallback-proved reconstructed replacement

When native fit overflows but the strict visual-clearance analyzer proves the admitted fallback class, the Inspector displays:

> Replacement is too wide; fallback evidence is proved

The Inspector may then expose **Apply reconstructed replacement**. That action creates the distinct canonical `RECONSTRUCT_EXISTING_TEXT` command. Its payload contains the revision-bound span, edit intent and expected provenance only; it does not carry cached clearance evidence or native-fit evidence.

At execution, `PdfMutationSession.reconstructExistingText(...)` reruns current provenance, font, fit and visual-clearance proof on the mutation session's exact parsed document. Only a fresh proved result may draw.

The writer masks only the proved clearance rectangle with the proved background color, then draws replacement text at the admitted source origin using the resolved source Standard-14 font, proved font size and proved target text color. Because PDF.js observed advance can differ slightly from Standard-14 metric width, clearance is conservatively proved for the larger of the projected replacement advance and the natural redraw width.

This is explicitly a **reconstructed visual replacement**, not native source-text replacement. It does not rewrite the original text-show operator; the original text can therefore remain present in extraction/search semantics underneath the visual mask. Native `REPLACE_EXISTING_TEXT` remains preferred whenever native fit succeeds.

### Unavailable state

The UI reports editing unavailable when any required proof is absent, including:
- unsupported or generic reconstructed source;
- missing working bytes, revision identity or PageGraph;
- failed exact provenance rematch;
- invalid replacement encoding;
- native overflow without proved clearance;
- stale or failed analysis.

### Direct on-page selection

Phase 13.1 adds a page-first entry point without widening edit authority.

The production rendered text layer retains the original PDF.js source-item index even when non-text PDF.js entries are skipped. A direct text activation publishes only:

- current revision identity;
- stable PageId;
- PDF.js source index.

The Inspector then resolves that identity against its freshly rebuilt canonical spans. A stale revision/PageId selection is ignored rather than rebound to unrelated text.

The same selection identity is mirrored back when the user changes the Inspector span dropdown, so the page can mark the exact source item. On mobile, an active PDF-text selection opens the existing Inspector sheet rather than the generic More Actions sheet.

Direct page interaction does **not** call provenance analysis, the pdf-lib writer, mutation session, or CommandBus. Native or reconstructed replacement remains available only after the existing **Check edit** capability proof; the reconstructed command then revalidates its proof again at execution.

Ordinary browser text selection and the existing text-mark annotation workflows remain available. Desktop targeting uses deliberate double-click activation. Touch targeting uses a single text-item tap only when no browser text range is active, so long-press/range selection remains available instead of every touch becoming an edit.

The existing annotation Inspector behavior is unchanged for Properties, Style, Metadata and Review tabs.
