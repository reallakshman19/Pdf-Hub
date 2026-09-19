# Header/Footer Template Contract

Status: **Phase 6A–6F canonical domain, writer, professional editor and printed-numbering preset contract**.

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

## Legacy compatibility

The following remain legacy compatibility paths during Phase 6 migration:

- `ADD_HEADER_FOOTER_TEXT`
- macro `header_footer_text`
- `PdfEditAdapter.addHeaderFooterText`

They are not the canonical professional model.

Later Phase 6 slices will compile/migrate legacy inputs into the new template command where compatibility requires it. New UI/Automate/SDK work must not create another header/footer schema.

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
