import { describe, it, expect, beforeEach } from 'vitest';
import { useAnnotationStore } from '../store';
import type { PdfAnnotation } from '../types';

function createMockAnnotation(
  id: string,
  x = 100,
  y = 100,
  locked = false,
): PdfAnnotation {
  return {
    id,
    type: 'textbox',
    pageNumber: 1,
    rect: { x, y, width: 80, height: 30 },
    data: {
      text: `Annotation ${id}`,
      locked,
    },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe('useAnnotationStore - Nudge & Locked Protection', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      annotations: [
        createMockAnnotation('unlocked-1', 100, 100, false),
        createMockAnnotation('locked-2', 200, 200, true),
        createMockAnnotation('unlocked-3', 300, 300, false),
      ],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
      clipboard: [],
      clipboardDocumentKey: null,
      clipboardPageSnapshot: null,
      pageCalibrations: {},
      nativeDeletionTombstones: [],
    });
  });

  describe('nudgeSelectedAnnotations', () => {
    it('nudges unlocked selected annotations by (dx, dy)', () => {
      useAnnotationStore.getState().setSelection(['unlocked-1']);
      useAnnotationStore.getState().nudgeSelectedAnnotations(1, -2);

      const item = useAnnotationStore.getState().annotations.find((a) => a.id === 'unlocked-1');
      expect(item?.rect.x).toBe(101);
      expect(item?.rect.y).toBe(98);
    });

    it('refuses to nudge locked annotations', () => {
      useAnnotationStore.getState().setSelection(['locked-2']);
      useAnnotationStore.getState().nudgeSelectedAnnotations(5, 5);

      const item = useAnnotationStore.getState().annotations.find((a) => a.id === 'locked-2');
      expect(item?.rect.x).toBe(200);
      expect(item?.rect.y).toBe(200);
    });

    it('nudges only unlocked items in a mixed multi-selection', () => {
      useAnnotationStore.getState().setSelection(['unlocked-1', 'locked-2']);
      useAnnotationStore.getState().nudgeSelectedAnnotations(10, 10);

      const unlocked = useAnnotationStore.getState().annotations.find((a) => a.id === 'unlocked-1');
      const locked = useAnnotationStore.getState().annotations.find((a) => a.id === 'locked-2');

      expect(unlocked?.rect.x).toBe(110);
      expect(unlocked?.rect.y).toBe(110);
      expect(locked?.rect.x).toBe(200);
      expect(locked?.rect.y).toBe(200);
    });
  });

  describe('locked protection in deletion', () => {
    it('protects locked annotation from deleteAnnotation', () => {
      useAnnotationStore.getState().deleteAnnotation('locked-2');
      const exists = useAnnotationStore.getState().annotations.some((a) => a.id === 'locked-2');
      expect(exists).toBe(true);
    });

    it('allows deleteAnnotation for unlocked items', () => {
      useAnnotationStore.getState().deleteAnnotation('unlocked-1');
      const exists = useAnnotationStore.getState().annotations.some((a) => a.id === 'unlocked-1');
      expect(exists).toBe(false);
    });

    it('preserves locked items when deleteSelection is invoked', () => {
      useAnnotationStore.getState().setSelection(['unlocked-1', 'locked-2', 'unlocked-3']);
      useAnnotationStore.getState().deleteSelection();

      const ids = useAnnotationStore.getState().annotations.map((a) => a.id);
      expect(ids).toEqual(['locked-2']);
      expect(useAnnotationStore.getState().selectedAnnotationIds).toEqual(['locked-2']);
    });
  });

  describe('locked protection in style updates', () => {
    it('bypasses locked items for style updates unless updating locked flag', () => {
      useAnnotationStore.getState().setSelection(['unlocked-1', 'locked-2']);
      useAnnotationStore.getState().updateStyleForSelection({ backgroundColor: '#ff0000' });

      const unlocked = useAnnotationStore.getState().annotations.find((a) => a.id === 'unlocked-1');
      const locked = useAnnotationStore.getState().annotations.find((a) => a.id === 'locked-2');

      expect(unlocked?.data.backgroundColor).toBe('#ff0000');
      expect(locked?.data.backgroundColor).toBeUndefined();
    });
  });
});
