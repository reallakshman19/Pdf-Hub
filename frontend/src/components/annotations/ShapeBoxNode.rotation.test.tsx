import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { ShapeRectNode } from './ShapeRectNode';
import { ShapeEllipseNode } from './ShapeEllipseNode';

describe('rectangle and ellipse preview styling', () => {
  it.each(['shape-rect', 'shape-ellipse'] as const)('uses zoom-correct stroke, dash and opacity for %s', (type) => {
    const annotation = { id: 'shape', type, pageNumber: 1, rect: { x: 10, y: 20, width: 100, height: 60 },
      data: { backgroundColor: 'transparent', borderColor: '#123456', borderWidth: 2, borderStyle: 'dashed', opacity: 0.4 },
      createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
    const props = { rect: { x: 20, y: 40, width: 200, height: 120 }, scale: 2, isSelected: false,
      onSelect: vi.fn(), onTransformStart: vi.fn() };
    const { container } = render(type === 'shape-rect'
      ? <ShapeRectNode {...props} annotation={{ ...annotation, type: 'shape-rect' }} />
      : <ShapeEllipseNode {...props} annotation={{ ...annotation, type: 'shape-ellipse' }} />);
    const element = container.querySelector(type === 'shape-rect' ? 'svg rect' : 'svg ellipse')!;
    expect(element.getAttribute('stroke-width')).toBe('4');
    expect(element.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(element.getAttribute('stroke-opacity')).toBe('0.4');
    expect(element.getAttribute('fill-opacity')).toBe('0.4');
    if (type === 'shape-rect') expect(element.getAttribute('x')).toBe('2');
    else expect(element.getAttribute('rx')).toBe('98');
  });
});
