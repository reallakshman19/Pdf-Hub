# PS No. to ISONOTE PDF Annotation Macro

## Purpose

The **PS No. → ISONOTE Annotation** builder in the Macros panel annotates a loaded PDF from a governed PS-number-to-ISONOTE table.

Example mapping:

```csv
PS No.,Support Family,ISONOTE
PS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"
```

The builder searches the loaded PDF for `PS-1234.5` and places a formatted ISONOTE box beside each occurrence by generating and executing a normal PDF Hub macro recipe.

## Supported table inputs

The builder accepts uploaded `.csv`, `.tsv`, or `.txt` files and pasted delimited or Markdown tables.

Recognized PS-number headers include:

- `PS No.`
- `PS Number`
- `Support Number`
- `Name of the element`

Recognized ISONOTE headers include:

- `ISONOTE`
- `Support ISONOTE`
- `Support Note`
- `Instruction`

Optional support-family headers include `Family`, `Support Family`, `Type`, and `Category`.

Comma, tab, semicolon, and pipe delimiters are detected automatically. ISONOTEs containing commas must be quoted in CSV files.

## Workflow

1. Open the target PDF in PDF Hub.
2. Open the **Macros** sidebar.
3. In **PS No. → ISONOTE Annotation**, load or paste the mapping table.
4. Select the page scope and note placement options.
5. Use **Preview Matches** to inspect mapped occurrences, missing PS numbers, confidence, and diagnostics.
6. Download the **PS No.-wise audit CSV** and **audit manifest JSON** when a traceable pre-run record is required.
7. Resolve stale or legacy marker diagnostics before adding another annotation.
8. Use **Annotate PDF** to update the loaded PDF working copy.
9. PDF Hub reopens the output, verifies its hash and page count, and reconciles every planned marker.
10. Download the output-bound audit CSV and manifest, then save or export the PDF through the normal PDF Hub workflow.

## Immutable audit identity

Every preview or annotation audit contains a content-addressed identity:

- deterministic run ID;
- input PDF SHA-256;
- output PDF SHA-256 after annotation;
- raw mapping-source SHA-256;
- canonical recipe SHA-256;
- page-scope and configuration SHA-256;
- input and output document keys when available;
- audit-schema and marker-schema versions.

The visible and exportable audit artifact is bound to the active in-memory PDF bytes, mapping source, page scope, selected pages, and recipe settings. Opening another PDF or changing a relevant option invalidates the displayed report instead of leaving stale evidence visible.

The manifest export contains the immutable identity, verification evidence, and high-level run counts. The CSV remains the PS-number-wise operational summary.

## Post-write verification

A successful macro execution is not, by itself, treated as verified annotation. After the working copy is replaced, PDF Hub performs a fail-closed verification pass:

1. Compute the output PDF SHA-256.
2. Confirm that the active output document key matches that hash.
3. Reopen the output through PDF.js.
4. Confirm that the output page count equals the pre-run page count.
5. Read the pages containing planned occurrences.
6. Reconcile each expected v2 marker by page, PS number, mapping hash, and occurrence ID.
7. Require exactly one matching marker for every planned occurrence.

The audit phase is promoted to `verified` only when all checks pass. Verification fails when:

- the output PDF cannot be reopened;
- the active document key does not match the output hash;
- the page count changes unexpectedly;
- an expected marker is missing; or
- an expected marker appears more than once.

A verification-failure report is bound to the mutated output PDF, so its evidence remains visible for diagnosis. The current verifier establishes structural output identity and marker integrity; it does not perform rendered-pixel comparison of the visible ISONOTE box.

## PS No.-wise audit

Preview, annotation, and verification runs create one summary row for every mapped PS number. The CSV columns are:

```csv
PS No.,Family,Mappings,Found PS,Occurrences,Annotated,Verified,Review,Missing,Average Confidence,Minimum Confidence,Errors
```

The report is deliberately PS-number-wise rather than family-wise. It retains:

- the exact PS number and source family;
- whether the PS number was found in the selected pages;
- total detected occurrences;
- occurrences written in the current successful run;
- occurrences independently verified in the reopened output;
- occurrences below the automatic confidence threshold and requiring review;
- stale and legacy existing annotations requiring review;
- missing mappings and mapping conflicts; and
- average/minimum match confidence and error count.

Occurrence evidence records the page, PDF rectangle, raw matched text, matching method, source mapping row, mapping hash, deterministic occurrence ID, existing-marker state, verification status, and number of PDF text items used to reconstruct the PS number.

### Confidence basis

Current confidence measures deterministic PDF text matching and geometry:

- canonical single-text-item matches receive the highest score;
- dash or whitespace-normalized matches receive a small identity penalty; and
- PS numbers reconstructed from several PDF text items receive a larger identity and geometry penalty and may enter the review queue.

The current automatic-release threshold is `90`. Scores are engineering quality scores, not statistical probabilities.

A searchable PDF does not expose the original OCR word confidence through PDF.js. OCR engine confidence must therefore be supplied by an OCR result sidecar in a later batch integration. The UI explicitly reports that the current score is based on the PDF text layer.

## Versioned annotation markers

Each generated occurrence receives a hidden searchable marker with this structure:

```text
PDFHUBISONOTE[v2|1234.5|<mapping-sha256>|<occurrence-sha256>]
```

The marker stores the PS suffix rather than the literal `PS-1234.5` token. The parser reconstructs the canonical PS number. This prevents the hidden marker itself from being rediscovered as a false PS occurrence on the next scan.

The semantic mapping hash covers normalized PS number, family, and ISONOTE. It deliberately excludes the table row number so moving an unchanged mapping within a source file does not make the annotation stale.

The occurrence ID covers PS number, page number, and rounded PDF geometry. It deliberately excludes the whole-document hash so the ID remains stable after the annotation itself changes the PDF bytes. Input and output PDF hashes remain part of the audit identity.

Existing-marker states are:

- **current** — PS number, mapping hash, and occurrence ID all match; safely skipped when skip-existing is enabled;
- **stale** — the same occurrence has a different mapping hash; held for review;
- **legacy** — an old unversioned `PDFHUBISONOTE[...]` marker is present; held for review; and
- **none** — no applicable existing marker; eligible for annotation.

Changing an ISONOTE can no longer be silently accepted merely because the PS number already appears in a hidden marker.

## Diagnostics

The audit report distinguishes informational, warning, and error conditions. Diagnostic codes cover:

- missing PS numbers;
- normalized or joined-text-item matches;
- current versioned annotations;
- stale mapping markers;
- legacy unversioned markers;
- review-required occurrences;
- conflicting mappings;
- failed annotation runs;
- unreadable output PDFs;
- output hash and page-count mismatches; and
- missing or duplicate occurrence markers.

Conflicting ISONOTEs are associated with the affected PS number and increment its `Errors` count. Verification diagnostics are also retained in the manifest with page and occurrence identifiers where applicable.

## Macro implementation

The builder uses PDF.js text coordinates to locate mapped PS-number occurrences. It then builds a `MacroRecipe` containing:

- one `place_rich_textbox` step per matched occurrence; and
- one small versioned searchable marker per occurrence.

The generated recipe runs through `runMacroRecipeAgainstSession`, so annotation changes use the same validation, atomic transaction, and working-copy replacement path as other PDF Hub macros. The separate post-write verifier then inspects the committed output bytes.

## Search and placement behavior

- PS numbers are normalized to the canonical form `PS-XXXX.Y`.
- Matching tolerates whitespace and common Unicode dash variants in PDF text.
- Unicode-dash variants are classified as normalized rather than exact evidence.
- Every eligible mapped occurrence in the selected scope is annotated.
- Placement can prefer the right side, prefer the left side, or choose automatically.
- Callout boxes are moved to reduce overlap with other generated ISONOTE boxes.
- The optional family value is included in the callout when present.
- Duplicate table rows keep the first mapping and report conflicting later rows.

## OCR requirement

The PDF must contain searchable text. For scanned or image-only drawings, run PDF Hub OCR and create or use a searchable PDF before running this macro.

## Compatibility with XML Compare Utilities

The parser accepts the `Name of the element` and `Support ISONOTE` column names used by the Navis Tag → ISONOTE final output in `XML_Compare_Utilities`. This allows that utility's exported or copied result table to be used directly as the annotation source.

## Current scope

This implementation supports CSV/text mapping tables, PS-number-wise audit CSV and manifest export, immutable audit identity, versioned marker diagnostics, and post-write structural verification for the active PDF. Native `.xlsx` workbook ingestion, visual pixel-level callout verification, and multi-PDF batch packaging are not included in this slice.
