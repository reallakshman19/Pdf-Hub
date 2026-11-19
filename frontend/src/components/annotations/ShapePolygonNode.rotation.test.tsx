import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShapePolygonNode } from './ShapePolygonNode';

describe('polygon preview appearance', () => {
  it('uses the same stroke, fill, dash, opacity and round joins as the native appearance', () => {
    const annotation = { id: 'a', type: 'shape-polygon' as const, pageNumber: 1,
      rect: { x: 1, y: 2, width: 10, height: 20 },
      data: { points: [1, 2, 11, 2, 5, 22], borderColor: '#ff0000', backgroundColor: '#00ff00',
        borderWidth: 3, borderStyle: 'dashed' as const, opacity: 0.6 }, createdAt: 1, updatedAt: 1 };
    const { container } = render(<ShapePolygonNode annotation={annotation} rect={{ x: 2, y: 4, width: 20, height: 40 }}
      scale={2} isSelected={false} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const polygon = container.querySelector('polygon')!;
    expect(polygon).toHaveAttribute('stroke', '#ff0000');
    expect(polygon).toHaveAttribute('fill', '#00ff00');
    expect(polygon).toHaveAttribute('stroke-width', '6');
    expect(polygon).toHaveAttribute('stroke-dasharray', '6 4');
    expect(polygon).toHaveAttribute('stroke-opacity', '0.6');
    expect(polygon).toHaveAttribute('fill-opacity', '0.6');
    expect(polygon).toHaveAttribute('stroke-linejoin', 'round');
  });
});
