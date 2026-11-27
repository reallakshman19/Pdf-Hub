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

  it('renders page-space polyline points cleanly at non-zero rect and 200% zoom without double-scaling', () => {
    const annotation: PdfAnnotation & { type: 'perimeter-takeoff' } = {
      id: 'pipe-run-zoom',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 100, y: 50, width: 72, height: 72 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [100, 50, 172, 50, 172, 122],
        isPipeRun: true,
        dimensionScale: 100,
        dimensionUnit: 'mm',
      },
    };

    const scale = 2;
    const scaledRect = {
      x: annotation.rect.x * scale, // 200
      y: annotation.rect.y * scale, // 100
      width: annotation.rect.width * scale,
      height: annotation.rect.height * scale,
    };

    const { container } = render(
      <PerimeterTakeoffNode
        annotation={annotation}
        rect={scaledRect}
        scale={scale}
        isSelected={true}
        onSelect={vi.fn()}
        onTransformStart={vi.fn()}
      />,
    );

    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThanOrEqual(2);
    // Vertices at scale=2 must be (200,100), (344,100), (344,244) — NOT double-scaled (400,...)
    expect(polylines[1].getAttribute('points')).toBe('200,100 344,100 344,244');
    // Unscaled length still 2540 + 2540 = 5080 mm
    expect(screen.getByText(/5,080 mm \(2 segs\)/)).toBeInTheDocument();
  });

  it('fires vertex drag, alt-click delete, and midpoint insert callbacks when selected', () => {
    const annotation: PdfAnnotation & { type: 'perimeter-takeoff' } = {
      id: 'pipe-interactive',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 100, height: 50 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [10, 10, 110, 10, 110, 60],
        isPipeRun: true,
      },
    };

    const onVertexDragStart = vi.fn();
    const onInsertMidpointVertex = vi.fn();
    const onDeleteVertex = vi.fn();

    const { container } = render(
      <PerimeterTakeoffNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        onSelect={vi.fn()}
        onTransformStart={vi.fn()}
        onVertexDragStart={onVertexDragStart}
        onInsertMidpointVertex={onInsertMidpointVertex}
        onDeleteVertex={onDeleteVertex}
      />,
    );

    const vHandle1 = container.querySelector('[data-vertex-handle="1"]')!;
    expect(vHandle1).not.toBeNull();
    vHandle1.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(onVertexDragStart).toHaveBeenCalledWith(expect.anything(), 1);

    vHandle1.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, altKey: true }),
    );
    expect(onDeleteVertex).toHaveBeenCalledWith(1);

    const midHandle0 = container.querySelector('[data-midpoint-handle="0"]')!;
    expect(midHandle0).not.toBeNull();
    midHandle0.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(onInsertMidpointVertex).toHaveBeenCalledWith(0, { x: 60, y: 10 });
  });
});
