import { describe, it, expect } from 'vitest';
import {
  isSelectTool,
  isHandTool,
  isTextMarkTool,
  isDualModalityNoteTool,
  isCanvasPlacementTool,
  isFreehandInkTool,
  isLineDrawTool,
  allowsTextSelection,
  allowsMarquee,
  allowsObjectSelection,
  getInteractionLayerPointerEvents,
  getPlacementLayerPointerEvents,
  getCanvasCursor,
  calculateGroupResize,
  TEXT_MARK_TOOLS,
  DUAL_MODALITY_NOTE_TOOLS,
  CANVAS_PLACEMENT_TOOLS,
} from '../toolInteractionMatrix';
import type { Rect } from '@/core/annotations/types';

describe('toolInteractionMatrix', () => {
  describe('classification predicates', () => {
    it('classifies select tool', () => {
      expect(isSelectTool('select')).toBe(true);
      expect(isSelectTool('hand')).toBe(false);
      expect(isSelectTool('highlight')).toBe(false);
    });

    it('classifies hand tool', () => {
      expect(isHandTool('hand')).toBe(true);
      expect(isHandTool('select')).toBe(false);
      expect(isHandTool('textbox')).toBe(false);
    });

    it('classifies text-mark tools', () => {
      for (const tool of TEXT_MARK_TOOLS) {
        expect(isTextMarkTool(tool)).toBe(true);
      }
      expect(isTextMarkTool('select')).toBe(false);
      expect(isTextMarkTool('sticky-note')).toBe(false);
      expect(isTextMarkTool('textbox')).toBe(false);
    });

    it('classifies dual-modality note tools', () => {
      for (const tool of DUAL_MODALITY_NOTE_TOOLS) {
        expect(isDualModalityNoteTool(tool)).toBe(true);
      }
      expect(isDualModalityNoteTool('select')).toBe(false);
      expect(isDualModalityNoteTool('highlight')).toBe(false);
      expect(isDualModalityNoteTool('shape-rect')).toBe(false);
    });

    it('classifies canvas placement tools', () => {
      for (const tool of CANVAS_PLACEMENT_TOOLS) {
        expect(isCanvasPlacementTool(tool)).toBe(true);
      }
      expect(isCanvasPlacementTool('select')).toBe(false);
      expect(isCanvasPlacementTool('highlight')).toBe(false);
      expect(isCanvasPlacementTool('hand')).toBe(false);
    });

    it('classifies freehand ink and line drawing tools', () => {
      expect(isFreehandInkTool('ink')).toBe(true);
      expect(isFreehandInkTool('line')).toBe(false);

      expect(isLineDrawTool('line')).toBe(true);
      expect(isLineDrawTool('arrow')).toBe(true);
      expect(isLineDrawTool('textbox')).toBe(false);
    });
  });

  describe('interaction permissions', () => {
    it('allows text selection for select, text marks, and dual-modality notes', () => {
      expect(allowsTextSelection('select')).toBe(true);
      expect(allowsTextSelection('highlight')).toBe(true);
      expect(allowsTextSelection('underline')).toBe(true);
      expect(allowsTextSelection('strikeout')).toBe(true);
      expect(allowsTextSelection('squiggly')).toBe(true);
      expect(allowsTextSelection('sticky-note')).toBe(true);
      expect(allowsTextSelection('comment')).toBe(true);
      expect(allowsTextSelection('callout')).toBe(true);

      // Placement & hand tools disable text selection
      expect(allowsTextSelection('textbox')).toBe(false);
      expect(allowsTextSelection('shape-rect')).toBe(false);
      expect(allowsTextSelection('line')).toBe(false);
      expect(allowsTextSelection('hand')).toBe(false);
      expect(allowsTextSelection('ink')).toBe(false);
    });

    it('allows marquee ONLY in select mode', () => {
      expect(allowsMarquee('select')).toBe(true);
      expect(allowsMarquee('hand')).toBe(false);
      expect(allowsMarquee('highlight')).toBe(false);
      expect(allowsMarquee('sticky-note')).toBe(false);
      expect(allowsMarquee('textbox')).toBe(false);
      expect(allowsMarquee('shape-rect')).toBe(false);
      expect(allowsMarquee('ink')).toBe(false);
    });

    it('allows object selection in select mode', () => {
      expect(allowsObjectSelection('select')).toBe(true);
      expect(allowsObjectSelection('hand')).toBe(false);
      expect(allowsObjectSelection('highlight')).toBe(false);
      expect(allowsObjectSelection('textbox')).toBe(false);
    });

    it('disables all pointer events in hand mode', () => {
      expect(getInteractionLayerPointerEvents('hand')).toBe('none');
      expect(getPlacementLayerPointerEvents('hand')).toBe('none');
    });

    it('configures layer pointer events properly across tools', () => {
      // Text layer active for select, text-marks, notes, ink
      expect(getInteractionLayerPointerEvents('select')).toBe('auto');
      expect(getInteractionLayerPointerEvents('highlight')).toBe('auto');
      expect(getInteractionLayerPointerEvents('sticky-note')).toBe('auto');
      expect(getInteractionLayerPointerEvents('ink')).toBe('auto');
      expect(getInteractionLayerPointerEvents('textbox')).toBe('none');

      // Placement layer active for placement tools, notes, ink
      expect(getPlacementLayerPointerEvents('textbox')).toBe('auto');
      expect(getPlacementLayerPointerEvents('shape-rect')).toBe('auto');
      expect(getPlacementLayerPointerEvents('sticky-note')).toBe('auto');
      expect(getPlacementLayerPointerEvents('ink')).toBe('auto');
      expect(getPlacementLayerPointerEvents('select')).toBe('none');
      expect(getPlacementLayerPointerEvents('highlight')).toBe('none');
    });

    it('returns appropriate cursor styles', () => {
      expect(getCanvasCursor('hand', false)).toBe('cursor-grab');
      expect(getCanvasCursor('hand', true)).toBe('cursor-grabbing');
      expect(getCanvasCursor('select')).toBe('cursor-default');
      expect(getCanvasCursor('highlight')).toBe('cursor-text');
      expect(getCanvasCursor('underline')).toBe('cursor-text');
      expect(getCanvasCursor('textbox')).toBe('cursor-crosshair');
      expect(getCanvasCursor('sticky-note')).toBe('cursor-crosshair');
      expect(getCanvasCursor('ink')).toBe('cursor-crosshair');
    });
  });

  describe('calculateGroupResize', () => {
    it('scales resizable box annotations proportionally and preserves fixed-size icons', () => {
      const groupRect: Rect = { x: 10, y: 10, width: 100, height: 100 };
      const items = [
        { id: 'box-1', rect: { x: 10, y: 10, width: 40, height: 30 }, type: 'textbox' },
        { id: 'note-1', rect: { x: 60, y: 60, width: 28, height: 28 }, type: 'sticky-note' },
      ];

      // Grow group by +50 in width and +50 in height (1.5x scale)
      const resized = calculateGroupResize(groupRect, items, 50, 50);

      // box-1: at x=10 (relX=0), width was 40 -> 40 * 1.5 = 60, height was 30 -> 30 * 1.5 = 45
      expect(resized['box-1'].x).toBe(10);
      expect(resized['box-1'].y).toBe(10);
      expect(resized['box-1'].width).toBe(60);
      expect(resized['box-1'].height).toBe(45);

      // note-1: relative x was 50 -> 50 * 1.5 = 75, so next x = 10 + 75 = 85
      // relative y was 50 -> 50 * 1.5 = 75, so next y = 10 + 75 = 85
      // width and height remain fixed 28x28
      expect(resized['note-1'].x).toBe(85);
      expect(resized['note-1'].y).toBe(85);
      expect(resized['note-1'].width).toBe(28);
      expect(resized['note-1'].height).toBe(28);
    });

    it('returns original rects on zero dimensions or empty items', () => {
      const invalidRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
      const items = [{ id: '1', rect: { x: 5, y: 5, width: 20, height: 20 }, type: 'textbox' }];
      const result = calculateGroupResize(invalidRect, items, 10, 10);
      expect(result['1']).toEqual(items[0].rect);
    });
  });
});
