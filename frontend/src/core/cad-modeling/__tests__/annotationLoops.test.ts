import { describe, it, expect } from 'vitest';
import { harvestLoopsFromAnnotations } from '../annotationLoops';
import type { PdfAnnotation } from '@/core/annotations/types';

describe('harvestLoopsFromAnnotations', () => {
  it('harvests shape-rect annotations into counter-clockwise CadClosedLoops', () => {
    const ann: PdfAnnotation = {
      id: 'rect-1',
      type: 'shape-rect',
      pageNumber: 1,
      rect: { x: 10, y: 20, width: 100, height: 50 },
      createdAt: 1,
      updatedAt: 1,
      data: {},
    };

    const loops = harvestLoopsFromAnnotations([ann]);
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBe(5000);
    expect(loops[0].vertices).toHaveLength(4);
    expect(loops[0].isClockwise).toBe(false);
  });

  it('harvests shape-polygon annotations with polygonPoints', () => {
    const ann: PdfAnnotation = {
      id: 'poly-1',
      type: 'shape-polygon',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        polygonPoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    };

    const loops = harvestLoopsFromAnnotations([ann]);
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBe(5000);
    expect(loops[0].vertices).toHaveLength(3);
  });

  it('extracts a closed loop formed by four connected line annotations via planar graph', () => {
    const lines: PdfAnnotation[] = [
      { id: 'l1', type: 'line', pageNumber: 1, rect: { x: 0, y: 0, width: 50, height: 0 }, createdAt: 1, updatedAt: 1, data: { startPoint: { x: 0, y: 0 }, endPoint: { x: 50, y: 0 } } },
      { id: 'l2', type: 'line', pageNumber: 1, rect: { x: 50, y: 0, width: 0, height: 40 }, createdAt: 1, updatedAt: 1, data: { startPoint: { x: 50, y: 0 }, endPoint: { x: 50, y: 40 } } },
      { id: 'l3', type: 'line', pageNumber: 1, rect: { x: 0, y: 40, width: 50, height: 0 }, createdAt: 1, updatedAt: 1, data: { startPoint: { x: 50, y: 40 }, endPoint: { x: 0, y: 40 } } },
      { id: 'l4', type: 'line', pageNumber: 1, rect: { x: 0, y: 0, width: 0, height: 40 }, createdAt: 1, updatedAt: 1, data: { startPoint: { x: 0, y: 40 }, endPoint: { x: 0, y: 0 } } },
    ];

    const loops = harvestLoopsFromAnnotations(lines);
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBe(2000);
  });
});
