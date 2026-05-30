/**
 * Canonical list of all annotation types in DocCraft.
 * Import this list instead of redefining annotation type arrays locally.
 *
 * If adding a new type:
 * 1. Add it here.
 * 2. Register a renderer in core/annotations/register-all.ts.
 * 3. Add a case to KonvaAdapter.addObject().
 * 4. Add export support in the PDF writer/export path.
 * 5. Add a toolbar button if it is user-facing.
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
  'shape-polygon',
  'shape-cloud',
  'line',
  'arrow',
  'ink',
  'stamp',
  'comment',
  'redaction',
] as const;

export type AnnotationType = typeof ANNOTATION_TYPES[number];

/** Runtime guard — use in parsers/deserializers. */
export function isAnnotationType(value: unknown): value is AnnotationType {
  return (
    typeof value === 'string' &&
    (ANNOTATION_TYPES as readonly string[]).includes(value)
  );
}

/** Types that require text selection to create. */
export const TEXT_SELECTION_TYPES: ReadonlyArray<AnnotationType> = [
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
];

/** Types that are created by dragging a rectangular region. */
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

/** Types that require point-to-point drawing. */
export const LINE_DRAW_TYPES: ReadonlyArray<AnnotationType> = [
  'line',
  'arrow',
];
