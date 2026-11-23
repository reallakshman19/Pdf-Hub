import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { AreaTakeoffNode } from './AreaTakeoffNode';
import { ShapePolygonNode } from './ShapePolygonNode';

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
});

describe('AreaTakeoffNode measurement takeoffs', () => {
  it('renders polygon and real-world area badge in m²', () => {
    const handlers = callbacks();
    // 72 x 72 pt square at 1:100 scale = 2.54m x 2.54m = 6.5 m²
    const annotation: PdfAnnotation & { type: 'shape-polygon' } = {
      id: 'area-1',
      type: 'shape-polygon',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 72, height: 72 },
      data: {
        points: [50, 50, 122, 50, 122, 122, 50, 122],
        isAreaTakeoff: true,
        dimensionScale: 100,
        dimensionUnit: 'm',
        dimensionPrecision: 1,
        borderColor: '#2563eb',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <AreaTakeoffNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        {...handlers}
      />,
    );

    const polygon = container.querySelector('polygon');
    expect(polygon).toBeTruthy();
    expect(polygon?.getAttribute('stroke')).toBe('#2563eb');

    const badge = container.querySelector('[data-testid="area-takeoff-badge"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe('6.5 m²');
  });

  it('delegates from ShapePolygonNode when isAreaTakeoff is set', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation & { type: 'shape-polygon' } = {
      id: 'area-delegated',
      type: 'shape-polygon',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 72, height: 72 },
      data: {
        points: [50, 50, 122, 50, 122, 122, 50, 122],
        isAreaTakeoff: true,
        dimensionScale: 100,
        dimensionUnit: 'm',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <ShapePolygonNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        {...handlers}
      />,
    );

    const badge = container.querySelector('[data-testid="area-takeoff-badge"]');
    expect(badge).toBeTruthy();
  });
});
