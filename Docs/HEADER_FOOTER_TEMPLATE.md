# Header/Footer Template Contract

Status: **Phase 6A canonical domain contract**.

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
