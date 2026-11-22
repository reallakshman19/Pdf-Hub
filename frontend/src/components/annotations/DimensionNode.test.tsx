import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { DimensionNode } from './DimensionNode';

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
});

describe('DimensionNode engineering caliper', () => {
  it('renders caliper lines and formatted metric readout', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation & { type: 'dimension' } = {
      id: 'dim-1',
      type: 'dimension',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 20 },
      data: {
        p1: { x: 100, y: 100 },
        p2: { x: 300, y: 100 },
        dimensionScale: 100, // 1:100
        dimensionUnit: 'mm',
        dimensionPrecision: 0,
        borderColor: '#dc2626',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <DimensionNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        {...handlers}
      />,
    );

    const lines = container.querySelectorAll('line');
    // Transparent hit line + start tick + end tick + main dimension line = 4 lines
    expect(lines.length).toBe(4);

    const readout = container.querySelector('[data-testid="dimension-readout"]');
    expect(readout).toBeTruthy();
    // 200pt at 1:100 scale = 200 * (25.4 / 72) * 100 = 7056 mm (formatted with locale comma)
    expect(readout?.textContent).toBe('7,056 mm');
  });

  it('renders explicit custom dimensionText when provided', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation & { type: 'dimension' } = {
      id: 'dim-2',
      type: 'dimension',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 20 },
      data: {
        p1: { x: 100, y: 100 },
        p2: { x: 300, y: 100 },
        dimensionText: '2200 mm',
        borderColor: '#dc2626',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <DimensionNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        {...handlers}
      />,
    );

    const readout = container.querySelector('[data-testid="dimension-readout"]');
    expect(readout?.textContent).toBe('2200 mm');
  });
});
