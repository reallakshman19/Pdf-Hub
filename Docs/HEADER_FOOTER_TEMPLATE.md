# Header/Footer Template Contract

Status: **Phase 6A–6H.2 complete canonical header/footer subsystem with saved-workflow compatibility**.

Tracking issue: #200.

This document defines the engine-neutral professional header/footer model. Phase 6A does not change PDF bytes, UI behavior, or legacy workflow execution.

## Concepts kept separate

PDF Hub must continue to distinguish:

1. stable page identity — `PageId`
2. current physical page position
3. logical PDF `/PageLabels`
4. printed header/footer/page-number content

Applying a header/footer template must never modify `/PageLabels`.

## Canonical template

The authoritative model lives in:

- `frontend/src/core/header-footer/types.ts`
- `frontend/src/core/header-footer/validation.ts`
- `frontend/src/core/header-footer/selectorResolver.ts`
- `frontend/src/core/header-footer/tokenResolver.ts`
- `frontend/src/core/header-footer/resolver.ts`

A template contains:

- schema version
- global page-edge offsets/margins
- default text style
- ordered rules

Each rule has:

- a PageId-aware selector
- optional header band
- optional footer band

Each band contains:

- left slot
- center slot
- right slot
- optional separator

## Selectors

Canonical selectors are resolved against the current `PageGraph`.

Supported include selectors:

- all pages
- explicit stable PageIds
- a range bounded by two PageIds
- one canonical PageLabel range identified by its start PageId

Selectors can additionally apply:

- physical odd/even parity
- first physical page exclusion
- last physical page exclusion

UI concepts such as "selected pages" are transient. Before command execution they must be compiled to stable PageIds rather than stored as a separate selector model.

Odd/even is based on one-based **physical position**, not the text of a logical PageLabel.

## Rule precedence

Rules are evaluated in array order.

When multiple rules match the same page, later rules override only the slots or separator they explicitly define. Other values from earlier matching rules remain effective.

This supports deterministic patterns such as:

- base footer on all pages
- front-matter override
- body override
- appendix override

without adding another template system.

## Content

### Text

Text uses one canonical token syntax:

- `{{physicalPage}}`
- `{{pageLabel}}`
- `{{pageCount}}`
- `{{sectionPage}}`
- `{{sectionPageCount}}`
- `{{fileName}}`
- `{{title}}`
- `{{author}}`
- `{{date}}`
- `{{time}}`
- `{{metadata:key}}`
- `{{var:key}}`

Legacy token forms such as `{page}` remain a compatibility concern for the legacy command/macro path. New professional templates must use the canonical syntax.

### Images

Image content stores only a serializable `binaryResourceId`.

Image bytes stay out-of-band through command resources. A header/footer template or history record must never embed raw image bytes.

## Styling

The domain models:

- font family
- font size in PDF points
- normal/bold weight
- normal/italic style
- hex color
- opacity
- page-edge offsets/margins
- optional separator thickness/color/insets
- image size/fit/opacity

The model deliberately does not name a PDF engine or `pdf-lib` font object.

Phase 6D will introduce a font-resolution/rendering seam. Helvetica may be an initial implementation fallback but is not the professional domain contract.

## Validation

`validateHeaderFooterTemplate(template, pageGraph)` fails closed for:

- unsupported schema version
- duplicate/empty rule IDs
- missing/stale PageIds
- PageLabel-range selectors that do not reference a canonical range start
- empty header/footer bands
- unknown tokens
- invalid colors/opacities/sizes/margins
- invalid image resource references

Validation may emit non-blocking warnings where a valid selector can resolve to no pages, such as excluding first and last page in a one-page document.


## Resolution semantics

`resolveHeaderFooterTemplate(template, pageGraph, context)` is the canonical
pure resolution boundary.

It validates first, then produces concrete per-page header/footer content for
the current PageGraph order. It does not load or mutate PDF bytes.

### Sections

Canonical PageLabel range starts define section boundaries. For a page inside a
canonical range:

- `sectionPage` is one-based within that range
- `sectionPageCount` is the number of physical pages until the next canonical
  PageLabel range start

If no canonical PageLabel range model exists, the whole document is treated as
one section.

`pageLabel` uses the resolved logical PageLabel when present. If no logical
label exists, it falls back to the one-based physical page number as text.

### Range and parity behavior

PageId ranges resolve against **current physical order**. The two PageId bounds
are inclusive and may be supplied in either order.

Odd/even filtering is always based on one-based physical position after the
include selector matches.

### Date and time

Resolution is deterministic and locale-independent by default:

- date: UTC `YYYY-MM-DD`
- time: UTC `HH:MM:SSZ`

A caller that owns a product locale may supply explicit `dateText` and
`timeText` in the resolution context. The canonical resolver never calls
locale-sensitive browser formatting itself.

### Missing dynamic values

A missing `{{metadata:key}}` or `{{var:key}}` resolves to an empty string
and emits a deduplicated warning. Template validation still rejects unknown
token syntax.

### Rule application

For each page, matching rules are evaluated in template order. Later matching
rules override only the header/footer slots or separator they define.

The resolved output contains no React, PDF.js or pdf-lib objects and is safe to
feed into a later engine-specific renderer.

## Canonical command and preflight

The canonical document command is:

```ts
APPLY_HEADER_FOOTER_TEMPLATE {
  template: HeaderFooterTemplate
}
```

The command payload remains JSON-serializable. Image bytes are not stored in
the command; the template references them with `binaryResourceId`.

`planHeaderFooterTemplateCommand(...)` is the pure preflight boundary. It:

- validates against the current PageGraph
- resolves selectors and tokens
- removes pages with no resolved header/footer content from the execution plan
- enumerates sorted unique binary resource IDs required by image slots
- returns a valid no-op plan with a warning if no pages match

Phase 6C deliberately does not render or mutate PDF bytes. The command becomes
executable when the Phase 6D writer is connected through the canonical
dispatcher/transaction path.

## PDF writer boundary

Phase 6D makes `APPLY_HEADER_FOOTER_TEMPLATE` executable through the canonical
dispatcher and `DocumentTransaction`.

The writer boundary is:

```ts
interface HeaderFooterPdfWriter {
  write(input: HeaderFooterPdfWriteInput): Promise<HeaderFooterPdfWriteResult>;
}
```

The current implementation is `pdfLibHeaderFooterWriter`. Product UI, Automate
and future SDK code must target the canonical command/template contract, not
this implementation.

### Geometry

The writer lays out content in viewer-facing visual page coordinates and maps
those positions back into PDF page coordinates for `/Rotate` values 0, 90, 180
and 270. Mixed page dimensions and quarter-turn rotations are supported by the
writer contract and smoke tests.

This is not yet the repository-wide final geometry service. Non-zero box
origins and deeper CropBox/MediaBox fidelity remain part of later geometry and
fidelity hardening.

### Fonts

The domain stores a logical font-family/style request; it does not store a
pdf-lib font object.

The initial pdf-lib resolver supports PDF standard-font families and style
variants. Unknown families currently fall back to Helvetica with an explicit
warning. This means Phase 6D does **not** claim full Unicode, Arabic, CJK or
custom-font fidelity. A later font implementation can replace the resolver
without changing the template contract.

### Images

PNG and JPEG image bytes are supplied out-of-band through command binary
resources. Missing image resources fail before PDF writing.

Image `contain` fit preserves aspect ratio. Width-only images preserve their
natural aspect ratio. `cover` with an explicit height would require a clipping
path; the current writer fails explicitly for that case rather than silently
distorting or overflowing the image.

### Persistence and history

Successful writes are committed through the same `applyMutation` /
`DocumentTransaction` path as other canonical document commands. A valid
template that matches no pages is a no-op and does not create history.

### Current performance limit

The current pdf-lib writer still loads and saves the complete PDF revision.
Phase 7 will put this execution behind the broader `PdfMutationEngine`
boundary and Phase 8 will address file-backed/large-document storage. The
professional template contract is intentionally independent of that migration.

## Professional editor UI

Phase 6E.1 adds one Organize entry point: **Header & Footer**.

The editor provides:

- six text zones: header/footer × left/center/right
- target compilation for all/current/selected/current-PageLabel-section
- physical odd/even filtering
- first/last physical-page exclusions
- standard-font family/style controls
- color, opacity and page-edge offsets
- header/footer separators
- canonical token insertion
- a representative-page preview driven by the same canonical resolver used by execution

Transient UI concepts such as "current" and "selected" never enter the
canonical template. The editor compiler resolves them to stable PageIds before
the command is created.

The preview uses actual PageGraph dimensions/rotation and resolved token values.
It is a layout preview, not a second PDF renderer.

Phase 6E.2 adds one admitted logo/image resource to the professional editor.
The image can target any header/footer left/center/right slot and explicitly
replaces text in that slot. PNG and JPEG are admitted through the existing
bounded image boundary; WebP is rejected because the current PDF writer cannot
embed it.

The template stores only `binaryResourceId`, placement and size. Raw
`Uint8Array` bytes remain in `CommandResources.binaries` for the duration of
execution and never enter the serialized command/history payload. Browser
object URLs are used only for local preview and are revoked when replaced,
removed, closed or unmounted.

The representative preview renders the admitted image and scales its requested
PDF-point width against the actual usable slot width.

## Printed numbering presets

Phase 6F defines task presets as thin compilers over the canonical template
model. There is no separate printed-numbering schema or command.

The built-in presets are:

- **Page N** → `Page {{physicalPage}}`
- **Page N of M** → `Page {{physicalPage}} of {{pageCount}}`
- **Logical label** → `{{pageLabel}}`
- **Section N of M** → `Page {{sectionPage}} of {{sectionPageCount}}`
- **Appendix label** → `Appendix A — {{pageLabel}}` by default

`createPrintedNumberingRule(...)` accepts a caller-owned canonical
`HeaderFooterPageSelector`, so future Automate/headless callers can use the
same preset definition with stable PageIds or PageLabel-range starts.

The professional dialog uses
`applyPrintedNumberingPresetToDraft(...)` to prefill the existing six-zone
editor. Applying a preset preserves targeting, parity, exclusions, typography,
margins and header content. It resets the three footer text slots to the chosen
pattern; a non-conflicting footer image is preserved. A footer image in the
preset's exact target slot is removed because one canonical slot can contain
only one content value.

Presets only generate printed content. They never call `SET_PAGE_LABELS`,
`writePdfPageLabels`, or otherwise mutate the PDF `/PageLabels` tree.

The Phase 6F acceptance test covers:

- cover with no printed number
- front matter i–iv using the logical-label preset
- body section using section page/section total
- appendix A using `Appendix A — A-1` style output

and verifies the PageGraph logical labels and canonical PageLabel ranges remain
unchanged after resolution.

## Automate and headless API

Phase 6G exposes the professional template through the same canonical command
contract outside the Organize toolbar.

### Automate

Automate has a focused **Header & Footer** quick task that reuses the same
`HeaderFooterDialog`. Apply materializes exactly:

```ts
APPLY_HEADER_FOOTER_TEMPLATE {
  template: HeaderFooterTemplate
}
```

with command source `macro-runner`. Image bytes, when present, are supplied
only through `CommandResources.binaries`.

This quick task does not create or execute a MacroStep. In particular, Phase
6G does not add a new `header_footer_template` macro operation.

### Headless API

`executeHeadlessPdfCommand(...)` accepts the canonical
`APPLY_HEADER_FOOTER_TEMPLATE` draft in addition to `SET_PAGE_LABELS`.
It inspects the exact source bytes to obtain the PageGraph, materializes and
validates the canonical command, then delegates to
`executeHeaderFooterTemplateMutation(...)`.

Headless callers may provide:

- `fileName` for filename tokens
- `createdAt` for deterministic date/time resolution
- `binaryResources` for image resource IDs
- `abortSignal` for cancellation

Raw binary resources remain out-of-band from the command payload.

The legacy Macro DSL operation `header_footer_text` remains readable and
executable only as a compatibility path until the explicit Phase 6H migration.
New Automate/headless work must use the canonical template command.

## Legacy migration and retirement

### 6H.1 Product UI migration

New product UI no longer creates the legacy
`ADD_HEADER_FOOTER_TEXT` command.

The thumbnail one-click page-number and file-header actions now resolve the
current target pages to stable PageIds and emit
`APPLY_HEADER_FOOTER_TEMPLATE` using
`createSimpleHeaderFooterTextTemplate(...)`.

The configurable thumbnail Header/Footer dialog likewise uses canonical
PageId selectors and canonical token syntax such as
`{{physicalPage}}`, `{{pageCount}}`, and `{{fileName}}`.

Automate's curated Quick Actions no longer expose the legacy
`footer-page-numbers` or `header-file-name` macro recipes; the professional
Header & Footer quick task introduced in Phase 6G replaces them.

The workflow builder no longer offers `header_footer_text` in its new-step
palette. The schema remains addressable so imported/saved recipes can still be
displayed and migrated.

The public built-in recipe catalog also hides every recipe whose required ops
include `header_footer_text`. Explicit `findBuiltInMacroRecipe(id)` lookup is
retained so historical built-in references can still resolve during migration.

This slice deliberately leaves saved Macro DSL compatibility intact.

### 6H.2 Saved-workflow compatibility and low-level retirement

Saved recipes containing `header_footer_text` remain valid. The legacy
MacroStep type, validator, schema lookup, metadata and registry entry are
retained for compatibility, but execution no longer calls
`PdfEditAdapter.addHeaderFooterText`.

The compatibility executor now:

1. resolves the legacy physical-page selector
2. excludes first/last pages using the historical flags
3. builds the current PageGraph and converts targets to stable PageIds
4. compiles legacy text/style into `HeaderFooterTemplate`
5. routes execution through `executeHeaderFooterTemplateMutation(...)`

Legacy token forms are normalized to the canonical equivalents:

- `{page}` / `{{page}}` → `{{physicalPage}}`
- `{pages}` / `{{pages}}` / `{{total_pages}}` → `{{pageCount}}`
- `{file}` / `{{file}}` / `{{file_name}}` → `{{fileName}}` when enabled
- `{date}` / `{{date}}` → `{{date}}` when enabled

The compatibility context supplies `dateText` using the historical
`toLocaleDateString()` behavior. Unknown or disabled double-brace sequences
are escaped through one-pass `{{var:...}}` placeholders so the canonical
resolver returns them literally instead of reinterpreting them.

Because all active and compatibility callers now use the canonical template
engine, Phase 6H.2 removes:

- `ADD_HEADER_FOOTER_TEXT`
- `HeaderFooterCommandOptions`
- `AddHeaderFooterTextCommand`
- the legacy validator/dispatcher case
- `PdfEditAdapter.addHeaderFooterText`
- its private `HeaderFooterOptions` adapter type

## Phase 6 acceptance scenario

The final Phase 6 certification includes a real-PDF acceptance test covering
the #200 reference document structure:

- cover with no printed number
- front matter i–iv with printed logical labels
- body section with `Page 1 of N`
- appendix A with `Appendix A — A-1`

The test resolves the representative preview, writes real PDF bytes, verifies
that applying printed content leaves the existing PDF `/PageLabels` unchanged,
performs a section-preserving reorder using stable PageIds, reserializes
PageLabels, performs history undo/redo, then reopens the resulting bytes with
PDF.js and verifies both logical labels and printed text are still attached to
the expected pages.

Header/footer application is a **static PDF write**, not a live formula layer.
After an arbitrary later reorder that changes a page's logical/section number,
the user must update/reapply the header/footer template to recalculate printed
number tokens. Structural edits move already-written content with its page.
The acceptance reorder preserves section-internal order so the written numbers
remain semantically valid while still exercising PageId anchoring and
PageLabels reserialization.

## Legacy compatibility

The only retained header/footer legacy surface is the saved Macro DSL operation
`header_footer_text`. It is a compatibility input format, not an execution
engine: it compiles into the canonical template subsystem before PDF mutation.

New UI, Automate, SDK, headless and workflow-authoring paths must use the
canonical `HeaderFooterTemplate` / `APPLY_HEADER_FOOTER_TEMPLATE` contract.

## Phase boundaries

- **6A:** domain + validation only
- **6B:** pure rule/page/token resolution
- **6C:** canonical `APPLY_HEADER_FOOTER_TEMPLATE` command
- **6D:** PDF writer/rendering boundary
- **6E:** professional UI + preview
- **6F:** printed-numbering presets
- **6G:** Automate/headless compatibility
- **6H:** legacy migration/retirement

Phase 7 will place mutation execution behind `PdfMutationEngine`; the Phase 6 domain must remain unchanged by that engine transition.
