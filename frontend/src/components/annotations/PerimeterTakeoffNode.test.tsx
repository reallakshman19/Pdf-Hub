import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerimeterTakeoffNode } from './PerimeterTakeoffNode';
import type { PdfAnnotation } from '../../core/annotations/types';

describe('PerimeterTakeoffNode', () => {
  it('renders node numbers, segment dimensions, and cumulative pipe run summary', () => {
    const annotation: PdfAnnotation & { type: 'line' } = {
      id: 'pipe-run-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 200, height: 100 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        points: [0, 0, 72, 0, 72, 72], // 2 segments: (0,0) -> (72,0) and (72,0) -> (72,72)
        dimensionScale: 100, // 1:100 scale (72 pt = 2540 mm)
        dimensionUnit: 'mm',
        startNodeNumber: 100,
        nodeIncrement: 10,
      },
    };

    const { container } = render(
      <PerimeterTakeoffNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onTransformStart={vi.fn()}
      />,
    );

    // Root element check
    const root = container.querySelector('[data-annotation-type="perimeter-takeoff"]');
    expect(root).toBeInTheDocument();

    // Node numbers rendered: 100, 110, 120
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();

    // Segment dimension labels (72 pt at 1:100 = 2540 mm)
    const segmentLabels = screen.getAllByText('2,540 mm');
    expect(segmentLabels.length).toBeGreaterThanOrEqual(1);

    // Cumulative run summary badge (2540 + 2540 = 5080 mm, 2 segs)
    expect(screen.getByText(/5,080 mm \(2 segs\)/)).toBeInTheDocument();
  });
});
