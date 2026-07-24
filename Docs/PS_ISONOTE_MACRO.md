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
6. Download the **PS No.-wise audit CSV** when a traceable pre-run record is required.
7. Use **Annotate PDF** to update the loaded PDF working copy.
8. Download the updated audit CSV and save or export the PDF through the normal PDF Hub workflow.

## PS No.-wise audit

Preview and annotation runs create one summary row for every mapped PS number. The CSV columns are:

```csv
PS No.,Family,Mappings,Found PS,Occurrences,Annotated,Review,Missing,Average Confidence,Minimum Confidence,Errors
```

The report is deliberately PS-number-wise rather than family-wise. It retains:

- the exact PS number and source family;
- whether the PS number was found in the selected pages;
- total detected occurrences;
- occurrences annotated in the current successful run;
- occurrences below the automatic confidence threshold and requiring review;
- missing mappings and mapping conflicts; and
- average/minimum match confidence and error count.

The occurrence evidence also records the page, PDF rectangle, raw matched text, matching method, source mapping row, and number of PDF text items used to reconstruct the PS number.

### Confidence basis

Current confidence measures deterministic PDF text matching and geometry:

- canonical single-text-item matches receive the highest score;
- dash or whitespace-normalized matches receive a small identity penalty; and
- PS numbers reconstructed from several PDF text items receive a larger identity and geometry penalty and may enter the review queue.

The current automatic-release threshold is `90`. Scores are engineering quality scores, not statistical probabilities.

A searchable PDF does not expose the original OCR word confidence through PDF.js. OCR engine confidence must therefore be supplied by an OCR result sidecar in a later batch integration. The UI explicitly reports that the current score is based on the PDF text layer.

## Diagnostics

The audit report distinguishes informational, warning, and error conditions. Diagnostic codes cover:

- missing PS numbers;
- normalized or joined-text-item matches;
- already annotated page/PS combinations;
- review-required occurrences;
- conflicting mappings; and
- failed annotation runs.

Conflicting ISONOTEs are associated with the affected PS number and increment its `Errors` count.

## Macro implementation

The builder uses PDF.js text coordinates to locate mapped PS-number occurrences. It then builds a `MacroRecipe` containing:

- one `place_rich_textbox` step per matched occurrence; and
- a small searchable marker per page/PS pair so subsequent runs can skip existing annotations.

The generated recipe runs through `runMacroRecipeAgainstSession`, so annotation changes use the same validation, transaction, and working-copy replacement path as other PDF Hub macros.

## Search and placement behavior

- PS numbers are normalized to the canonical form `PS-XXXX.Y`.
- Matching tolerates whitespace and common Unicode dash variants in PDF text.
- Every mapped occurrence in the selected scope is annotated.
- Placement can prefer the right side, prefer the left side, or choose automatically.
- Callout boxes are moved to reduce overlap with other generated ISONOTE boxes.
- The optional family value is included in the callout when present.
- Duplicate table rows keep the first mapping and report conflicting later rows.

## OCR requirement

The PDF must contain searchable text. For scanned or image-only drawings, run PDF Hub OCR and create/use a searchable PDF before running this macro.

## Compatibility with XML Compare Utilities

The parser accepts the `Name of the element` and `Support ISONOTE` column names used by the Navis Tag → ISONOTE final output in `XML_Compare_Utilities`. This allows that utility's exported or copied result table to be used directly as the annotation source.

## Current scope

This implementation supports CSV/text mapping tables and PS-number-wise audit CSV export for the active PDF. Native `.xlsx` workbook ingestion and multi-PDF batch packaging are not included; export the required worksheet to CSV or paste its relevant columns into the builder.
