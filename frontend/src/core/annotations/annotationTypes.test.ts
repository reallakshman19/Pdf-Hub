import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_TYPES,
  LINE_DRAW_TYPES,
  SHAPE_DRAG_TYPES,
  TEXT_SELECTION_TYPES,
  isAnnotationType,
} from './annotationTypes';

describe('annotationTypes', () => {
  it('exposes the canonical annotation type registry', () => {
    expect(ANNOTATION_TYPES).toEqual([
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
    ]);
  });

  it('guards unknown values at runtime', () => {
    expect(isAnnotationType('highlight')).toBe(true);
    expect(isAnnotationType('note')).toBe(false);
    expect(isAnnotationType('legacy-shape')).toBe(false);
    expect(isAnnotationType(null)).toBe(false);
  });

  it('classifies creation workflow groups', () => {
    expect(TEXT_SELECTION_TYPES).toEqual(['highlight', 'underline', 'strikeout', 'squiggly']);
    expect(SHAPE_DRAG_TYPES).toContain('shape-rect');
    expect(SHAPE_DRAG_TYPES).toContain('callout');
    expect(LINE_DRAW_TYPES).toEqual(['line', 'arrow']);
  });
});
