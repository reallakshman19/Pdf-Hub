import { readFileSync, writeFileSync } from 'fs';

const file = 'C:\\Users\\reall\\.gemini\\antigravity\\brain\\5d036229-e0af-4168-9509-0164c3a95e7e\\agent_prompts.md';
const lines = readFileSync(file, 'utf8').split('\n');

// Lines are 0-indexed in the array, 1-indexed in the file
// Keep lines 1-563 (new Phase 2 ends at line 563)
// Skip lines 564-693 (old Phase 2 leftover)
// Keep line 694 (empty), 695 (---), 696 (empty)
// Replace lines 697-900 (old Phase 3) with new Phase 3
// Keep line 901 (empty), 902 (---), 903 (empty)
// Replace lines 904-1052 (old Phase 4) with new Phase 4

const before = lines.slice(0, 563); // Lines 1-563

const phase3 = `# S-PHASE 3 — Annotation Coordinate Stability & Persistence Hardening

\`\`\`\`
You are a coding agent working on DocCraft, a React PDF editor at c:\\Code1\\Pdf-Hub.

## Your Task
Add an AnnotationGeometry contract type that bridges annotation types with the
existing normalized geometry system. Add coordinate stability tests for zoom and rotation.
Verify persistence uses IndexedDB, never localStorage. Add batch reprojection utilities.

## Rules
- AGENTS.md governs. No console.log. Use @/ imports. Frontend only.
- INV-10: No localStorage for annotation data. IndexedDB only.
- INV-4: Domain types in core/ must not reference library types (no Konva, no pdfjs-dist).

## Context: What Already Exists

### Annotation Types (core/annotations/types.ts)
- \`Rect { x, y, width, height }\`
- \`Point2D { x, y }\`
- \`PdfAnnotation { id, type, pageNumber, rect, data, createdAt, updatedAt }\`
- \`data.normalizedGeometry?: unknown\` — stores normalized form
- \`data.geometryVersion?: number\` — migration version

### Normalized Geometry (core/annotations/normalized.ts — 224 lines)
Already has:
- \`NormalizedAnnotationGeometry { rect: NormRect, anchor?, knee?, points?, paths? }\`
- \`normalizeRect()\`, \`denormalizeRect()\`, \`normalizePoint()\`, \`denormalizePoint()\`
- \`rotateNormRect()\`, \`rotateNormPoint()\`, \`rotateNormPath()\`
- \`normalizeAnnotationGeometry()\`, \`denormalizeAnnotationGeometry()\`
- \`migrateAnnotationToNormalized()\`, \`migrateAnnotationFromNormalized()\`
- \`ensureAnnotationHasNormalizedGeometry()\`

### Coordinate Transforms (core/writer-v2/)
Already has: PdfRect, ViewportRect, PdfPoint, ViewportPoint, WriterPageViewport, full transforms.

### Persistence (core/annotations/persistence.ts)
- Uses \`idb\` library (IndexedDB wrapper) — keyed by document hash, schema v2
- NO localStorage anywhere

### Page Remapper (core/annotations/pageRemapper.ts)
Already handles: reorder, delete, insert, rotate, duplicate operations on annotations.

## Work Item 1: Create geometry.ts

Create file: \`frontend/src/core/annotations/geometry.ts\`

Full code is in implementation_plan.md S-Phase 3.1. Key exports:
- \`PageRotation = 0 | 90 | 180 | 270\`
- \`AnnotationGeometry\` interface — page context + viewport rect + normalized coords
- \`createAnnotationGeometry(pageNumber, rotation, width, height, rect)\` — with zero-dimension guard
- \`reprojectGeometry(geometry, newWidth, newHeight)\` — zoom stability
- \`reprojectForRotation(geometry, newRotation, newWidth, newHeight)\` — rotation stability
- \`batchReproject(geometries[], newWidth, newHeight)\` — batch zoom update

## Work Item 2: Create geometry.test.ts

Create file: \`frontend/src/core/annotations/geometry.test.ts\`

Full test code is in implementation_plan.md S-Phase 3.2. Test scenarios:
1. Creates geometry with normalized coords in [0,1] range (US Letter 612×792)
2. Reprojects to 2× size (zoom simulation) — viewport coords double, normalized stay same
3. Round-trip at same size within 0.01 tolerance
4. Non-standard page sizes (A4: 595×842) — center point normalizes to ~0.5
5. Zero-width protection — uses Math.max(1, ...) internally
6. Rotation: updates rotation and page dimensions, recalculates viewport
7. Batch reproject: multiple geometries at once
8. Multi-operation stability: zoom→un-zoom round-trip preserves coords
9. Progressive zoom: 1x→1.5x→2x→1x preserves original positions

## Work Item 3: Create persistence.contract.test.ts

Create file: \`frontend/src/core/annotations/persistence.contract.test.ts\`

Tests (using fs.readFileSync to check source files):
1. persistence.ts does not contain 'localStorage'
2. store.ts does not contain 'localStorage'
3. persistence.ts contains 'idb' import
4. No .ts file in core/annotations/ uses localStorage

Full test code is in implementation_plan.md S-Phase 3.3.

## Acceptance Gate

\`\`\`
pnpm --dir frontend check:release
\`\`\`

## What NOT To Do
- Do NOT modify normalized.ts — it's already correct and tested
- Do NOT modify store.ts — it already uses page remappers correctly
- Do NOT modify persistence.ts — it already uses IndexedDB correctly
- Do NOT import Konva or pdfjs-dist in any core/ file (INV-4)
- Do NOT replace NormalizedAnnotationGeometry — extend/wrap it
\`\`\`\``;

const phase4 = `# S-PHASE 4 — WordPad-Style Toolbar, Image/Table Insertion & Export Pipeline

\`\`\`\`
You are a coding agent working on DocCraft, a React PDF editor at c:\\Code1\\Pdf-Hub.

## Your Task
Complete the WordPad-like editing experience:
(A) Wire Lexical custom nodes (from Phase 2) into toolbar buttons
(B) Add image insertion via file picker + drag-and-drop
(C) Add table insertion dialog + clipboard paste-as-table
(D) Fix export pipeline to preserve rich formatting (bold/italic/font/color)

## User Priority
"Table import, rich text, image insertion, 'WordPad' Like user interface for editing is priority."
Find/replace is explicitly de-prioritized.

## Rules
- AGENTS.md governs. No console.log. Use @/ imports. Frontend only.
- The writer-v2 command model (17 commands, 50-deep undo/redo) is in writerCommandStore.ts.
  DO NOT rewrite it. DO NOT replace it.
- Lexical is already installed: @lexical/history, @lexical/html, @lexical/list,
  @lexical/selection, @lexical/react, @lexical/rich-text, @lexical/table

## Context: What Already Exists

### Existing Main Toolbar (WriterV2ToolbarControls.tsx — 7.6 KB)
Currently has 6 buttons: Text Box, Callout, Copy Region, Flatten, Save Project, Open Project.
MISSING: Font controls, image insert, table insert, undo/redo buttons.

### Existing Popup Editor Toolbar (inside WriterPopupEditor.tsx — 14.6 KB)
Has: font family, font size, color, B/I/U/S, alignment, lists.
MISSING: headings, insert image, insert table, highlight color.

### Custom Nodes (from Phase 2)
Available at: \`@/core/writer-v2/lexical-nodes/\`
- \`ImageNode\` — inline/block images in rich text
- \`tableHelpers\` — insertTable(), insertTableFromData()
- \`headingHelpers\` — toggleHeading()

### Export Pipeline (flattenedPdfExport.ts)
Currently uses ONLY \`plainText\` — all rich formatting is lost on export.

## Work Item 1: Audit Existing Toolbar

FIRST, read \`WriterV2ToolbarControls.tsx\` and \`WriterPopupEditor.tsx\` fully.
List what controls already exist. Only add what's missing.

WordPad checklist:
- [ ] Font family selector → \`$patchStyleText(selection, { 'font-family': value })\`
- [ ] Font size selector → \`$patchStyleText(selection, { 'font-size': value + 'px' })\`
- [ ] Bold/Italic/Underline/Strikethrough → \`FORMAT_TEXT_COMMAND\`
- [ ] Text color picker → \`$patchStyleText(selection, { color: hex })\`
- [ ] Highlight color → \`$patchStyleText(selection, { 'background-color': hex })\`
- [ ] Heading selector (H1-H3) → \`toggleHeading(editor, 'h1')\`
- [ ] Bullet/Numbered list → \`INSERT_UNORDERED_LIST_COMMAND\`
- [ ] Text alignment (L/C/R) → \`FORMAT_ELEMENT_COMMAND\`
- [ ] Insert image button → file picker + \`$createImageNode()\`
- [ ] Insert table button → size dialog + \`insertTable()\`

## Work Item 2: Add Missing Toolbar Controls

Full component code is in implementation_plan.md S-Phase 4.1.
Key components to create/add:
- FontFamilyDropdown, FontSizeDropdown
- TextColorPicker, HighlightColorPicker
- InsertImageButton (with file picker)
- InsertTableButton (with rows/cols dialog)
- HeadingDropdown

Group in toolbar: Text format | Style | Color | List | Alignment | Insert | Indent

## Work Item 3: Create ImageDropPlugin

Create: \`frontend/src/components/writer-v2/plugins/ImageDropPlugin.tsx\`
Lexical plugin for drag-and-drop image insertion.
Add \`<ImageDropPlugin />\` inside \`<LexicalComposer>\` in WriterPopupEditor.tsx.

Full code is in implementation_plan.md S-Phase 4.2.

## Work Item 4: Create TablePastePlugin

Create: \`frontend/src/components/writer-v2/plugins/TablePastePlugin.tsx\`
Detects pasted CSV/TSV data and inserts as Lexical table.
Add \`<TablePastePlugin />\` inside \`<LexicalComposer>\` in WriterPopupEditor.tsx.

Full code is in implementation_plan.md S-Phase 4.3.

## Work Item 5: Create richTextRenderer.ts (Export Fix)

Create: \`frontend/src/core/writer-v2/export/richTextRenderer.ts\`
Parses Lexical editorStateJson into PdfBlock[] for pdf-lib rendering.
Preserves: bold, italic, underline, font-size, font-family, color, headings, inline images.
Falls back to plainText on parse failure.

Key types:
- \`PdfTextSegment\` — styled text run with position
- \`PdfBlock\` — text | image | table
- \`editorStateToPdfBlocks(element)\` — main conversion function

Full code is in implementation_plan.md S-Phase 4.4.

## Work Item 6: Create richTextRenderer.test.ts

Create: \`frontend/src/core/writer-v2/export/richTextRenderer.test.ts\`

Tests: fallback text, paragraph parsing, bold detection (format bit 1),
italic (bit 2), bold+italic (bit 3), heading font sizes, inline-image parsing,
malformed JSON handling, inline style extraction.

Full test code is in implementation_plan.md S-Phase 4.5.

## Work Item 7: Add writer workflow tests

Add to the same test file or create \`writerWorkflow.test.ts\`:
- Create→Move→Undo workflow
- Locked element rejects move

## Work Item 8: Add Toolbar CSS

Create: \`frontend/src/components/writer-v2/writerToolbar.css\`
WordPad-style toolbar with grouped controls, hover effects, color pickers.
Full CSS is in implementation_plan.md S-Phase 4.6.

## Acceptance Gate

\`\`\`
pnpm --dir frontend check:release
pnpm --dir frontend test -- --grep "Writer"
pnpm --dir frontend test -- --grep "editorStateToPdfBlocks"
pnpm --dir frontend test -- --grep "ImageNode"
\`\`\`

## What NOT To Do
- Do NOT rewrite writerCommandStore.ts — it's 704 lines and fully tested
- Do NOT rewrite writerCommands.ts — the 17 command types are stable
- Do NOT create a new "WriterDocument" schema — WriterElementV2 is the schema
- Do NOT replace Lexical with contenteditable — Lexical IS the editor
- Do NOT add new npm dependencies (all Lexical packages are already installed)
- Do NOT implement find/replace (explicitly de-prioritized by user)
\`\`\`\``;

// Build new content:
// - Keep lines 0-562 (up to end of new Phase 2 backtick)
// - Skip lines 563-693 (old Phase 2 leftover)
// - Add separator + Phase 3
// - Add separator + Phase 4
// - Keep lines 1053-end (Phase 5 and beyond)

const afterPhase4 = lines.slice(1052); // From line 1053 onwards (0-indexed: 1052)

const newContent = [
  ...before,
  '',
  '---',
  '',
  ...phase3.split('\n'),
  '',
  '---',
  '',
  ...phase4.split('\n'),
  '',
  '---',
  '',
  ...afterPhase4,
].join('\n');

writeFileSync(file, newContent, 'utf8');
console.log('Agent prompts updated. Total lines:', newContent.split('\n').length);

// Verify structure
const verify = readFileSync(file, 'utf8');
const phases = verify.split('\n').filter(l => l.startsWith('# S-PHASE'));
console.log('Phase headers found:');
phases.forEach(p => console.log(' ', p));
