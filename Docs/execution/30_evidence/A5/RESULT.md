# Work Item A5: Tool Interaction Matrix + Review Markup Mechanics — Evidence & Delivery Record

## 1. Summary of Delivery

Delivered a formal, predictable interaction matrix across tools, text layers, and canvas layers in the DocCraft workspace. Replaced the rudimentary inline selection popup with a dedicated, collision-aware, accessible `TextSelectionActionBubble`. Eliminated fake text-mark creation on empty canvas clicks, unified note semantics around canonical `sticky-note`, and introduced group interactions (multi-select move, group resize, and keyboard arrow nudge).

## 2. Invariant & Contract Adherence

- **INV-1 (One React root)**: Verified exactly 1 `createRoot` in `frontend/src/main.tsx`.
- **INV-2 (PyMuPDF isolation)**: Zero fitz calls outside `backend/pdf_engine/`.
- **INV-4 (Pure TypeScript domain types)**: Tool interaction matrix and types in `core/tools/` and `core/annotations/` have zero Konva or DOM library dependencies.
- **INV-11 (Zero console.log)**: Zero `console.log` in non-test source code.

## 3. Formal Tool Interaction Matrix Verification

| Tool Category | Tools | Text Selection Layer | Canvas Placement Layer | Marquee Permitted | Empty Click Behavior | Direct Markup on MouseUp |
|---|---|---|---|---|---|---|
| **Select** | `select` | Active (`userSelect: 'text'`) | Inactive | Allowed (`allowsMarquee = true`) | Clears selection / resets | Shows `TextSelectionActionBubble` |
| **Text-Mark** | `highlight`, `underline`, `strikeout`, `squiggly` | Active (`userSelect: 'text'`) | Inactive | Blocked | **Strict No-Op** (0 annotations created) | Direct markup creation on mouseUp |
| **Note / Callout** | `sticky-note`, `comment`, `callout` | Dual Modality | Dual Modality | Blocked | Click-to-place at (x, y) | Attaches note/callout to selection |
| **Canvas Shapes** | `textbox`, `shape-rect`, `shape-ellipse`, `shape-polygon`, `shape-cloud`, `stamp`, `redaction`, CAD | Disabled (`userSelect: 'none'`) | Active (`zIndex: 100`) | Blocked | Draws shape / places item | Disabled |
| **Lines / Vectors** | `line`, `arrow` | Disabled | Active | Blocked | 2-click line draw | Disabled |
| **Freehand Ink** | `ink` | Path capture | SVG overlay | Blocked | Freehand polyline | Disabled |
| **Hand / Pan** | `hand` | Disabled (`pointerEvents: 'none'`) | Disabled (`pointerEvents: 'none'`) | Blocked | Pans viewport (`cursor: grab/grabbing`) | Disabled |

## 4. Key Additions & Refactorings

1. `src/core/tools/toolInteractionMatrix.ts`:
   - Pure domain classification functions (`isSelectTool`, `isHandTool`, `isTextMarkTool`, `isDualModalityNoteTool`, `isCanvasPlacementTool`, `allowsTextSelection`, `allowsMarquee`, `allowsObjectSelection`, `getInteractionLayerPointerEvents`, `getPlacementLayerPointerEvents`, `getCanvasCursor`, `calculateGroupResize`).
2. `src/components/workspace/TextSelectionActionBubble.tsx`:
   - Accessible floating toolbar (`role="toolbar"`, `aria-label="Text selection actions"`, `data-testid="text-selection-action-bubble"`).
   - Action buttons: Highlight, Underline, Strikeout, Squiggly, Sticky Note, Callout, Copy Text (with visual "Copied!" feedback badge), Dismiss (`X` or `Escape`).
   - Collision-aware positioning: Clamps within page margins; flips below selection if selection is near top edge (`y < 45`).
3. `src/core/annotations/store.ts`:
   - Added `nudgeSelectedAnnotations(dx: number, dy: number)` with undoable transaction history (`'Nudge annotations'`).
   - Protected locked annotations (`annotation.data.locked === true`): cannot be moved, resized, nudged, deleted via `deleteAnnotation` or `deleteSelection`, or styled via `updateStyleForSelection`.
4. `src/hooks/useKeyboardShortcuts.ts`:
   - Arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`): nudge selected annotations by 1 pt (or 10 pt with Shift) without triggering page flips.
   - When no annotations are selected, Arrow keys navigate pages normally.
5. `src/components/workspace/DocumentWorkspace.tsx`:
   - Integrated matrix helpers, eliminating ad-hoc conditionals.
   - Blocked empty-page clicks with text-mark tools from creating fake 0x0 or pseudo annotations.
   - Hand tool disables all markup layers (`pointerEvents: 'none'`) for smooth panning.
   - Multi-select group resize scales resizable box annotations proportionally while preserving fixed-size icons.

## 5. Automated Verification Results

- `npx tsc --noEmit`: Exited with code 0 (0 errors).
- `npx eslint`: Exited with code 0 (0 errors across all modified & newly authored files).
- Vitest Test Suites:
  - `src/core/tools/__tests__/toolInteractionMatrix.test.ts`: 14/14 tests pass.
  - `src/components/workspace/__tests__/TextSelectionActionBubble.test.tsx`: 7/7 tests pass.
  - `src/core/annotations/__tests__/store.nudgeAndLock.test.ts`: 7/7 tests pass.
  - `src/hooks/__tests__/useKeyboardShortcuts.nudge.test.ts`: 3/3 tests pass.
  - `src/hooks/useKeyboardShortcuts.test.ts`: 3/3 tests pass.
  - `src/components/workspace/__tests__/DocumentWorkspace.interactionMatrix.test.tsx`: 7/7 tests pass.
  - `src/components/workspace/DocumentWorkspace.test.tsx`: 62/62 tests pass.
  - **Total: 103/103 tests pass across 7 test suites (100% pass rate).**
