# Phase 2 — Annotation Pipeline + Persistence

**Depends on:** Phase 1 complete  
**Can run in parallel with:** Phase 3  
**Estimated effort:** ~3 hours

---

## WI-2.1 — Canonical Annotation Type Registry

**Create:** `frontend/src/core/annotations/annotationTypes.ts`

This becomes the single source of truth referenced by the toolbar, editor store, KonvaAdapter, and PDF writer.

```typescript
/**
 * Canonical list of all annotation types in DocCraft.
 * Import this — do NOT define your own union or list elsewhere.
 * 
 * If adding a new type:
 *   1. Add it here
 *   2. Add a case to KonvaAdapter.addObject()
 *   3. Add a case to the PDF writer exporter
 *   4. Add a button to ToolbarComment if user-facing
 */
export const ANNOTATION_TYPES = [
  'textbox',
  'callout',
  'sticky-note',
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
  'shape-rect',
  'shape-ellipse',
  'shape-cloud',
  'shape-polygon',
  'line',
  'arrow',
  'ink',
  'stamp',
  'comment',
  'redaction',
] as const;

export type AnnotationType = typeof ANNOTATION_TYPES[number];

/** Runtime guard — use in parsers/deserializers */
export function isAnnotationType(value: unknown): value is AnnotationType {
  return (
    typeof value === 'string' &&
    (ANNOTATION_TYPES as readonly string[]).includes(value)
  );
}

/** Types that require text selection to create */
export const TEXT_SELECTION_TYPES: ReadonlyArray<AnnotationType> = [
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
];

/** Types that are shape-drawn (drag to create a rect) */
export const SHAPE_DRAG_TYPES: ReadonlyArray<AnnotationType> = [
  'textbox',
  'shape-rect',
  'shape-ellipse',
  'shape-cloud',
  'shape-polygon',
  'callout',
  'redaction',
  'stamp',
];

/** Types that require point-to-point drawing */
export const LINE_DRAW_TYPES: ReadonlyArray<AnnotationType> = [
  'line',
  'arrow',
];
```

**Update `editor/types.ts`** — replace the ActiveTool union:

```typescript
// frontend/src/core/editor/types.ts
import type { AnnotationType } from '@/core/annotations/annotationTypes';

// ActiveTool is either a navigation tool or any annotation type
export type ActiveTool = 'select' | 'hand' | AnnotationType;

export type SidebarTab =
  | 'thumbnails'
  | 'bookmarks'
  | 'comments'
  | 'search'
  | 'macros';

export type InspectorTab = 'properties' | 'style' | 'metadata' | 'review';
export type RibbonTab = 'file' | 'organize' | 'annotate' | 'macro' | 'view';

export interface EditorState {
  activeTool: ActiveTool;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  leftPanelWidth: number;
  rightPanelWidth: number;
}
```

**Pass gate:**
```bash
# Must be empty — no remaining stale aliases
grep -rn "'shape'\|'freehand'" frontend/src --include="*.ts" --include="*.tsx"
```

---

## WI-2.2 — Fix ToolbarComment (Remove `as any`, Remove Duplicate Ink)

**File:** `frontend/src/components/toolbar/ToolbarComment.tsx`

Because `ActiveTool` now covers all annotation types, remove all `as any` casts. Also delete the duplicate Ink button (lines 158–162).

**Replace** the `handleToolClick` signature:

```typescript
// BEFORE:
const handleToolClick = (tool: Exclude<ActiveTool, 'select' | 'hand'>) => {

// AFTER — AnnotationType is now the correct parameter type:
import type { AnnotationType } from '@/core/annotations/annotationTypes';

const handleToolClick = (tool: AnnotationType) => {
  setActiveTool(activeTool === tool ? 'select' : tool);
};
```

**Remove all `as any` casts** — every button call is now type-safe:

```typescript
// ALL THESE are now valid without casting:
onClick={() => handleToolClick('squiggly')}
onClick={() => handleToolClick('ink')}
onClick={() => handleToolClick('callout')}
onClick={() => handleToolClick('shape-rect')}
onClick={() => handleToolClick('shape-polygon')}
onClick={() => handleToolClick('shape-cloud')}
onClick={() => handleToolClick('redaction')}
```

**Delete the duplicate Ink block** (lines 158–162 in the original):

```diff
- <Tooltip content="Ink">
-   <Button variant={getToolVariant('ink')} size="icon" onClick={() => handleToolClick('ink')}>
-     <PenTool className="w-4 h-4" />
-   </Button>
- </Tooltip>
```

**Pass gate:**
```bash
grep -n "as any" frontend/src/components/toolbar/ToolbarComment.tsx  # → no results
grep -n "PenTool" frontend/src/components/toolbar/ToolbarComment.tsx  # → exactly 1 result
```

---

## WI-2.3 — Complete KonvaAdapter (All 17 Annotation Types)

**File:** `frontend/src/adapters/annotation-canvas/KonvaAdapter.ts`

Replace the entire `addObject` switch statement with this complete implementation. **Critical fix included:** all `Line`/`Arrow`/`squiggly` nodes use local coordinates (points relative to node origin), not absolute canvas coordinates — this prevents the double-offset bug.

```typescript
addObject(annotation: PdfAnnotation): Konva.Shape | null {
  if (!this.layer) return null;

  const cfg = serializeAnnotationToKonvaConfig(annotation);
  const d = annotation.data;

  // Convenience shorthands
  const stroke   = (d.borderColor as string | undefined) ?? '#1e293b';
  const fill     = (d.backgroundColor as string | undefined) ?? 'transparent';
  const sw       = (d.borderWidth as number | undefined) ?? 2;
  const opacity  = (d.opacity as number | undefined) ?? 1;

  let node: Konva.Shape;

  switch (annotation.type) {
    // ── Text ──────────────────────────────────────────────────────────────
    case 'textbox':
      node = new Konva.Text({
        ...cfg,
        text: (d.text as string | undefined) ?? 'Text',
        fontSize: (d.fontSize as number | undefined) ?? 14,
        fontFamily: (d.fontFamily as string | undefined) ?? 'sans-serif',
        fill: (d.textColor as string | undefined) ?? '#111827',
        wrap: 'word',
        ellipsis: false,
        padding: 4,
      });
      break;

    // ── Callout ───────────────────────────────────────────────────────────
    case 'callout':
      node = new Konva.Rect({
        ...cfg,
        fill: fill !== 'transparent' ? fill : '#eff6ff',
        stroke: stroke !== '#1e293b' ? stroke : '#2563eb',
        strokeWidth: sw,
        cornerRadius: 4,
        opacity,
      });
      break;

    // ── Sticky note ───────────────────────────────────────────────────────
    case 'sticky-note':
      node = new Konva.Rect({
        ...cfg,
        fill: '#fef08a',
        stroke: '#ca8a04',
        strokeWidth: 1,
        cornerRadius: 3,
        opacity,
      });
      break;

    // ── Text marks (use line nodes with LOCAL points) ─────────────────────
    case 'highlight':
      node = new Konva.Rect({
        ...cfg,
        fill: (d.backgroundColor as string | undefined) ?? '#fde68a',
        opacity: Math.min(opacity, 0.45),
        stroke: 'transparent',
        strokeWidth: 0,
      });
      break;

    case 'underline':
      node = new Konva.Line({
        x: cfg.x,
        y: cfg.y,
        width: cfg.width,
        height: cfg.height,
        // LOCAL coords: line sits at bottom of the bounding rect
        points: [0, cfg.height, cfg.width, cfg.height],
        stroke: stroke !== '#1e293b' ? stroke : '#dc2626',
        strokeWidth: 2,
        id: cfg.id,
        opacity,
      });
      break;

    case 'strikeout':
      node = new Konva.Line({
        x: cfg.x,
        y: cfg.y,
        width: cfg.width,
        height: cfg.height,
        // LOCAL coords: line runs through the vertical midpoint
        points: [0, cfg.height / 2, cfg.width, cfg.height / 2],
        stroke: stroke !== '#1e293b' ? stroke : '#dc2626',
        strokeWidth: 2,
        id: cfg.id,
        opacity,
      });
      break;

    case 'squiggly': {
      // Build wavy points in LOCAL coordinate space
      const wavePoints: number[] = [];
      const step = 5;
      const amplitude = 2;
      const baseY = cfg.height; // bottom of bounding rect
      for (let i = 0; i <= cfg.width; i += step) {
        const y = baseY + (Math.floor(i / step) % 2 === 0 ? -amplitude : amplitude);
        wavePoints.push(i, y);
      }
      node = new Konva.Line({
        x: cfg.x,
        y: cfg.y,
        width: cfg.width,
        height: cfg.height,
        points: wavePoints,
        stroke: '#dc2626',
        strokeWidth: 1.5,
        lineCap: 'round',
        lineJoin: 'round',
        id: cfg.id,
        opacity,
      });
      break;
    }

    // ── Shapes ────────────────────────────────────────────────────────────
    case 'shape-rect':
      node = new Konva.Rect({
        ...cfg,
        fill,
        stroke,
        strokeWidth: sw,
        opacity,
      });
      break;

    case 'shape-ellipse':
      node = new Konva.Ellipse({
        x: cfg.x + cfg.width / 2,
        y: cfg.y + cfg.height / 2,
        radiusX: cfg.width / 2,
        radiusY: cfg.height / 2,
        fill,
        stroke,
        strokeWidth: sw,
        opacity,
        id: cfg.id,
      });
      break;

    case 'shape-polygon':
      // Hexagon approximation in LOCAL coords
      node = new Konva.RegularPolygon({
        x: cfg.x + cfg.width / 2,
        y: cfg.y + cfg.height / 2,
        sides: 6,
        radius: Math.min(cfg.width, cfg.height) / 2,
        fill,
        stroke,
        strokeWidth: sw,
        opacity,
        id: cfg.id,
      });
      break;

    case 'shape-cloud':
      // Cloud as a dashed rect (full cloud path is a Phase 3 enhancement)
      node = new Konva.Rect({
        ...cfg,
        fill,
        stroke,
        strokeWidth: sw,
        dash: [6, 3],
        cornerRadius: 16,
        opacity,
      });
      break;

    // ── Lines ─────────────────────────────────────────────────────────────
    case 'line':
      node = new Konva.Line({
        x: cfg.x,
        y: cfg.y,
        // LOCAL coords: diagonal from top-left to bottom-right of bounding rect
        points: [0, 0, cfg.width, cfg.height],
        stroke,
        strokeWidth: sw,
        lineCap: 'round',
        id: cfg.id,
        opacity,
      });
      break;

    case 'arrow':
      node = new Konva.Arrow({
        x: cfg.x,
        y: cfg.y,
        // LOCAL coords
        points: [0, 0, cfg.width, cfg.height],
        stroke,
        fill: stroke,
        strokeWidth: sw,
        pointerLength: 10,
        pointerWidth: 8,
        lineCap: 'round',
        id: cfg.id,
        opacity,
      });
      break;

    // ── Ink / freehand ────────────────────────────────────────────────────
    case 'ink': {
      const paths = d.paths as Array<number[]> | undefined;
      const points = d.points as number[] | undefined;
      const allPoints = paths ? paths.flat() : (points ?? []);
      if (allPoints.length < 4) {
        // Not enough points — render a visible placeholder instead of silently failing
        node = new Konva.Rect({
          ...cfg,
          stroke: '#f59e0b',
          strokeWidth: 2,
          dash: [4, 2],
          fill: 'transparent',
          id: cfg.id,
        });
      } else {
        node = new Konva.Line({
          ...cfg,
          points: allPoints,
          stroke,
          strokeWidth: sw,
          tension: 0.5,
          lineCap: 'round',
          lineJoin: 'round',
          opacity,
        });
      }
      break;
    }

    // ── Stamp ─────────────────────────────────────────────────────────────
    case 'stamp':
      node = new Konva.Rect({
        ...cfg,
        stroke: '#dc2626',
        strokeWidth: 2.5,
        dash: [6, 2],
        fill: 'transparent',
        cornerRadius: 3,
        opacity,
      });
      break;

    // ── Comment (pin icon approximation) ──────────────────────────────────
    case 'comment':
      node = new Konva.Circle({
        x: cfg.x + cfg.width / 2,
        y: cfg.y + cfg.height / 2,
        radius: Math.min(cfg.width, cfg.height) / 2,
        fill: '#3b82f6',
        stroke: '#1d4ed8',
        strokeWidth: 1.5,
        opacity: 0.85,
        id: cfg.id,
      });
      break;

    // ── Redaction ─────────────────────────────────────────────────────────
    case 'redaction':
      node = new Konva.Rect({
        ...cfg,
        fill: '#000000',
        stroke: '#000000',
        strokeWidth: 0,
        opacity: 1,
      });
      break;

    default: {
      // Explicit fallback — warn so we can track unsupported types
      const unknownType = (annotation as { type: string }).type;
      import('@/core/logger/service').then(({ warn }) => {
        warn('annotation', 'Fallback renderer used — type not implemented in KonvaAdapter', {
          type: unknownType,
          id: annotation.id,
        });
      });
      node = new Konva.Rect({
        ...cfg,
        fill: '#fef9c3',
        stroke: '#f59e0b',
        strokeWidth: 2,
        dash: [3, 3],
        opacity: 0.7,
      });
      break;
    }
  }

  node.draggable(true);
  this.layer.add(node);
  this.layer.draw();
  return node;
}
```

**Pass gate:**
1. Browser check — create one of each annotation type
2. No gray solid rectangle fallback for any supported type
3. Log console shows zero `Fallback renderer used` warnings for the 17 supported types

---

## WI-2.4 — Annotation Persistence Matrix

After completing WI-2.3, verify this matrix in the browser. Record results in `AUDIT_BASELINE.md`:

| Type | Create | Select | Move | Reload persists |
|------|:------:|:------:|:----:|:---------------:|
| textbox | ☐ | ☐ | ☐ | ☐ |
| highlight | ☐ | ☐ | ☐ | ☐ |
| underline | ☐ | ☐ | ☐ | ☐ |
| strikeout | ☐ | ☐ | ☐ | ☐ |
| squiggly | ☐ | ☐ | ☐ | ☐ |
| shape-rect | ☐ | ☐ | ☐ | ☐ |
| shape-ellipse | ☐ | ☐ | ☐ | ☐ |
| shape-cloud | ☐ | ☐ | ☐ | ☐ |
| shape-polygon | ☐ | ☐ | ☐ | ☐ |
| line | ☐ | ☐ | ☐ | ☐ |
| arrow | ☐ | ☐ | ☐ | ☐ |
| ink | ☐ | ☐ | n/a | ☐ |
| callout | ☐ | ☐ | ☐ | ☐ |
| sticky-note | ☐ | ☐ | ☐ | ☐ |
| stamp | ☐ | ☐ | ☐ | ☐ |
| comment | ☐ | ☐ | ☐ | ☐ |
| redaction | ☐ | ☐ | ☐ | ☐ |

**Pass gate:** Create column = 17/17 PASS. Reload column ≥ 10/17 PASS.

---

## Phase 2 Completion Checklist

```
□ annotationTypes.ts created with ANNOTATION_TYPES const array
□ ActiveTool in editor/types.ts imports AnnotationType — no hardcoded union
□ All as any casts removed from ToolbarComment.tsx
□ Duplicate Ink button deleted (only 1 PenTool icon in toolbar)
□ KonvaAdapter switch covers all 17 types + explicit fallback with warning log
□ Line/Arrow/squiggly use LOCAL Konva coordinates (points relative to node x,y)
□ ink annotation with no paths renders amber dashed rect (not silent nothing)
□ Fallback renderer log warning fires for unsupported types only
□ Persistence matrix completed (create column = 17/17)
□ grep for 'shape'|'freehand' in runtime code returns 0 results
```
