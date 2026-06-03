# Pending Work

Tracking the multi-part writer / macro request. Items are tackled one by one.

## ✅ Done

### V2 writer formatting features
Added to the Write ribbon, with display rendering (visible in the placed text box, not just while editing):

- Superscript / Subscript (`FORMAT_TEXT_COMMAND`)
- Indent / Outdent (`INDENT_CONTENT_COMMAND` / `OUTDENT_CONTENT_COMMAND`)
- Line height dropdown (Auto / 1.0 / 1.15 / 1.5 / 2.0 / 2.5)
- Code block (`$setBlocksType` → `CodeNode`)
- Blockquote (`$setBlocksType` → `QuoteNode`)
- Horizontal rule (`INSERT_HORIZONTAL_RULE_COMMAND`)
- Letter spacing dropdown
- Text transform (None / UPPER / lower / Title)
- Paragraph spacing (before/after margins)

Supporting changes: added `@lexical/code@0.44.0`; registered `QuoteNode`, `CodeNode`,
`CodeHighlightNode`, `HorizontalRuleNode` + `HorizontalRulePlugin`; new
`writerEditorTheme.css`; new `blockHelpers.ts`; rewrote `writerDisplayHtml.ts`
(sanitized inline-style passthrough). 149 writer-v2 tests pass; build verified.

### Writer text box double-click to edit
Fixed: double-click now opens the inline editor (manual double-click detection in
the pointer handlers, since the native `dblclick` is unreliable on a drag-handling
element).

## ⏳ Pending

### 1. Rename v1 writer → "callout"
Refactor `components/writer/*` and `core/writer/*` to be named "callout" and used
only for callout popups (v2 is the writer now). Footprint: ~15 importers plus
commit pipeline, macros, session recovery, exporter. v1 store is in-memory
(low data-loss risk), but verify no persisted `'writer'` type tags break.

### 2. Restore macro panel + recipe builder
The components exist (`MacroRecipeBuilder`, `MacroBuilderDrawer`, builder/*) but are
not wired to the toolbar. Restore per screenshots: toolbar with **Macro Panel**,
**Rotate 90**, **Page Numbers**, **Built-ins**, and the dropdown
(Add Page Numbers (Footer), Add File Header, Batch Text Stamp, Open Macro Panel).

### 3. Customizable built-ins
Add settings UIs so the user can customize:
- Add Page Numbers (position, format, start number, margins, font)
- Add File Header (text, position, font)
- Batch Text Stamp (text, placement, opacity, pages)

## Known issues / notes
- Pre-existing lint error `WriterRibbon.tsx:100` (`setActiveFormats` in effect,
  original `!activeEditor` branch) — not introduced by feature work.
- The local preview sandbox runs in "preview mode" (PDF page rendering disabled),
  so writer-overlay features can't be exercised there; verified via tests + build.
