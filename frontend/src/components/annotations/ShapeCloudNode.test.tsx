import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { computeParametricCloudPath, ShapeCloudNode } from './ShapeCloudNode';

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
});

describe('ShapeCloudNode parametric arcs', () => {
  it('computes continuous cubic Bézier path for revision clouds', () => {
    const path = computeParametricCloudPath(100, 80, 8, false);
    expect(path).toMatch(/^M 0 0 /);
    expect(path).toContain('C ');
    expect(path).toMatch(/Z$/);
  });

  it('supports inverted arcs and custom arc radius', () => {
    const normalPath = computeParametricCloudPath(100, 80, 8, false);
    const invertedPath = computeParametricCloudPath(100, 80, 8, true);
    expect(normalPath).not.toBe(invertedPath);
  });

  it('renders ShapeCloudNode with svg path', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation & { type: 'shape-cloud' } = {
      id: 'cloud-1',
      type: 'shape-cloud',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 120, height: 90 },
      data: {
        cloudArcRadius: 10,
        cloudInverted: false,
        borderColor: '#dc2626',
        backgroundColor: '#fee2e2',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <ShapeCloudNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        {...handlers}
      />,
    );

    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('stroke')).toBe('#dc2626');
    expect(path?.getAttribute('fill')).toBe('#fee2e2');
    expect(path?.getAttribute('d')).toContain('C ');
  });
});
