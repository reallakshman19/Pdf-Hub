import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentNode } from './CommentNode';
import { StickyNoteNode } from './StickyNoteNode';
import type { PdfAnnotation } from '../../core/annotations/types';

describe('native text note preview on rotated pages', () => {
  it.each([
    [0, { x: 80, y: 180, width: 40, height: 20 }, 80, 180],
    [90, { x: 200, y: 80, width: 20, height: 40 }, 220, 80],
    [180, { x: 180, y: 200, width: 40, height: 20 }, 220, 220],
    [270, { x: 180, y: 180, width: 20, height: 40 }, 180, 220],
  ])('keeps the icon upright and anchored at %i degrees', (rotation, rect, x, y) => {
    const onSelect = vi.fn(); const onTransformStart = vi.fn();
    for (const type of ['comment', 'sticky-note'] as const) {
      const annotation: PdfAnnotation = { id: type, type, pageNumber: 1, rect,
        data: { text: 'note' }, createdAt: 1, updatedAt: 1 };
      const common = { annotation, rect, scale: 1, isSelected: false, pageRotation: rotation, onSelect, onTransformStart };
      const view = type === 'comment'
        ? render(<CommentNode {...common} annotation={{ ...annotation, type: 'comment' }} />)
        : render(<StickyNoteNode {...common} annotation={{ ...annotation, type: 'sticky-note' }} />);
      const element = view.container.querySelector(`[data-annotation-type="${type}"]`) as HTMLElement;
      expect(element.style.left).toBe(`${x}px`);
      expect(element.style.top).toBe(`${y}px`);
      expect(element.style.transform).toBe('');
      if (type === 'sticky-note') expect((element.firstElementChild as HTMLElement).style.transform).toBe('');
      if (type === 'comment') { expect(element.style.width).toBe('40px'); expect(element.style.height).toBe('20px'); }
      fireEvent.pointerDown(element);
      expect(onSelect).toHaveBeenCalled();
      expect(onTransformStart).toHaveBeenCalled();
      view.unmount();
    }
  });
});
