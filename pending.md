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

### 1. Rename v1 writer → "callout"
Done: refactored `components/writer/*` → `components/callout/*` and `core/writer/*`
→ `core/callout/*` (`useCalloutStore`, `CalloutOverlay`, `CalloutInspectorPanel`,
`CalloutElementNode`, `CalloutSnapGuides`, `CalloutTableData`,
`bakeCalloutElementsIntoPdf`, `calloutObjects.ts`); dropped dead `serializer.ts`;
migrated all production callers, tests, and audit scripts (`certify-writer-v2-ocr.mjs`,
`phase8-static-audit.mjs`); eliminated duplicate `WriterTableData` contract so
`writer-v2` owns the sole Writer stack and `audit:contracts` passes. Preserved
`data-testid="writer-overlay-capture"` for OCR E2E tests and kept `'rich-text' |
'image' | 'table'` and `'ocr-region'` literals intact.

### 2. Restore macro panel + recipe builder
Done: verified and completed wiring across [AutomateRibbonControls.tsx](frontend/src/components/shell/AutomateRibbonControls.tsx)
(`CtxBar` Automate section with Macro Builder, Automate Panel, Header & Footer,
Page Numbers, Rotate 90°, Review Stamp, and Workflows dropdown including built-in
recipes, customizable built-ins, Open Visual Recipe Builder, and Open Automate
Panel), [MacroBuilderDrawer.tsx](frontend/src/components/macro/MacroBuilderDrawer.tsx)
(added accessible `dialog` semantics, `Escape`-to-close, close button label,
timer cleanup, and `#/macro-builder` full-page link), [useKeyboardShortcuts.ts](frontend/src/hooks/useKeyboardShortcuts.ts)
(`Ctrl/Cmd+M` now expands the Automate panel and opens Macro Builder to match
TopNav `⌘M`), and full `--writer-*` light/dark theme tokens + responsive grid in
`MacroRecipeBuilder` and `components/macro/builder/*` (preserving retired
`ToolbarMacro.tsx` per `ToolbarMacro.test.tsx` and `automate-phase3-audit.mjs`).

### 3. Customizable built-ins
Done: expanded [ThumbnailMacroConfigDialog.tsx](frontend/src/components/sidebar/thumbnails/ThumbnailMacroConfigDialog.tsx)
(wired from [AutomateRibbonControls.tsx](frontend/src/components/shell/AutomateRibbonControls.tsx)
and [ThumbnailContextMenu.tsx](frontend/src/components/sidebar/thumbnails/ThumbnailContextMenu.tsx))
so all three built-ins support full settings:
- **Add Page Numbers**: zone/position (`header`/`footer` + `left`/`center`/`right`), format presets + custom template, `startNumber` rule support across [types.ts](frontend/src/core/header-footer/types.ts) / [validation.ts](frontend/src/core/header-footer/validation.ts) / [resolver.ts](frontend/src/core/header-footer/resolver.ts) / [simpleTextTemplate.ts](frontend/src/core/header-footer/simpleTextTemplate.ts), horizontal & vertical margins, font family (`Helvetica`/`Times Roman`/`Courier`), style (`Regular`/`Bold`/`Italic`/`Bold Italic`), size, color, opacity, and page scope.
- **Add File Header**: text + quick token chips (`{{fileName}}`, `{{date}}`, `{{physicalPage}}`, `{{pageCount}}`), zone + alignment + margins, font family/style/size/color/opacity, and page scope.
- **Batch Text Stamp**: text with `{page}/{pages}/{file}/{date}` token support, placement presets (`Bottom/Top Left/Center/Right`, `Center`, `Custom`) plus fine `X/Y/Alignment`, opacity, and validated page scope (`selection`/`all`/`current`/`range`).

## ⏳ Pending

None — all items in this backlog are completed.

## Known issues / notes
- Pre-existing lint error `WriterRibbon.tsx:100` (`setActiveFormats` in effect,
  original `!activeEditor` branch) — not introduced by feature work.
- The local preview sandbox runs in "preview mode" (PDF page rendering disabled),
  so writer-overlay features can't be exercised there; verified via tests + build.
