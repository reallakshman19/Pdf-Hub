import { describe, it, expect } from 'vitest';
import { remapAfterReorder, remapAfterDelete, remapAfterInsert, remapAfterRotate } from './pageRemapper';
import type { PdfAnnotation } from './types';

describe('pageRemapper', () => {
  const expectRectClose = (
    actual: { x: number; y: number; width: number; height: number },
    expected: { x: number; y: number; width: number; height: number },
  ) => {
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
    expect(actual.width).toBeCloseTo(expected.width, 10);
    expect(actual.height).toBeCloseTo(expected.height, 10);
  };

  const createMockAnnotation = (id: string, pageNumber: number): PdfAnnotation => ({
    id,
    pageNumber,
    type: 'textbox',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    data: {},
    createdAt: 0,
    updatedAt: 0,
  });

  describe('remapAfterReorder', () => {
    it('remaps page numbers correctly based on new order array', () => {
      const annotations = [
        createMockAnnotation('1', 1),
        createMockAnnotation('2', 2),
        createMockAnnotation('3', 3),
      ];
      // order = [2, 0, 1] means:
      // page 2 (1-based 3) moves to 0 (1-based 1)
      // page 0 (1-based 1) moves to 1 (1-based 2)
      // page 1 (1-based 2) moves to 2 (1-based 3)
      const order = [2, 0, 1];
      const remapped = remapAfterReorder(annotations, order);

      expect(remapped.find(a => a.id === '1')?.pageNumber).toBe(2);
      expect(remapped.find(a => a.id === '2')?.pageNumber).toBe(3);
      expect(remapped.find(a => a.id === '3')?.pageNumber).toBe(1);
    });

    it('leaves annotations alone if page index is out of bounds', () => {
      const annotations = [createMockAnnotation('1', 5)];
      const order = [0, 1, 2];
      const remapped = remapAfterReorder(annotations, order);
      expect(remapped[0].pageNumber).toBe(5);
    });
  });

  describe('remapAfterDelete', () => {
    it('removes annotations on deleted pages and shifts others down', () => {
      const annotations = [
        createMockAnnotation('1', 1),
        createMockAnnotation('2', 2),
        createMockAnnotation('3', 3),
        createMockAnnotation('4', 4),
      ];
      // Delete page index 1 (1-based 2) and 2 (1-based 3)
      const deletedIndices = [1, 2];
      const remapped = remapAfterDelete(annotations, deletedIndices);

      expect(remapped).toHaveLength(2);
      expect(remapped.find(a => a.id === '1')?.pageNumber).toBe(1);
      expect(remapped.find(a => a.id === '4')?.pageNumber).toBe(2); // Shifted down by 2
    });

    it('returns original array if deletedIndices is empty', () => {
      const annotations = [createMockAnnotation('1', 1)];
      const remapped = remapAfterDelete(annotations, []);
      expect(remapped).toBe(annotations);
    });
  });

  describe('remapAfterInsert', () => {
    it('shifts annotations up if inserted before them', () => {
      const annotations = [
        createMockAnnotation('1', 1),
        createMockAnnotation('2', 2),
      ];
      // Insert 2 pages at index 1 (before 1-based 2)
      const remapped = remapAfterInsert(annotations, 1, 2);

      expect(remapped.find(a => a.id === '1')?.pageNumber).toBe(1);
      expect(remapped.find(a => a.id === '2')?.pageNumber).toBe(4); // 2 + 2
    });

    it('returns original array if count <= 0', () => {
      const annotations = [createMockAnnotation('1', 1)];
      const remapped = remapAfterInsert(annotations, 0, 0);
      expect(remapped).toBe(annotations);
    });
  });

  describe('remapAfterRotate', () => {
    it('rotates rectangle and geometry fields by 90 degrees and stores normalized metadata', () => {
      const annotations: PdfAnnotation[] = [{
        ...createMockAnnotation('r1', 1),
        rect: { x: 20, y: 30, width: 50, height: 60 },
        data: {
          anchor: { x: 180, y: 140 },
          knee: { x: 120, y: 80 },
          points: [20, 30, 70, 90],
          paths: [[10, 20, 30, 40]],
        },
      }];

      const remapped = remapAfterRotate(annotations, [{ pageIndex: 0, angle: 90, width: 200, height: 150 }]);
      const first = remapped[0];

      expectRectClose(first.rect, { x: 60, y: 20, width: 60, height: 50 });
      expect(first.data.anchor?.x).toBeCloseTo(10, 10);
      expect(first.data.anchor?.y).toBeCloseTo(180, 10);
      expect(first.data.knee?.x).toBeCloseTo(70, 10);
      expect(first.data.knee?.y).toBeCloseTo(120, 10);
      expect(first.data.points).toEqual([120, 20, 60, 70]);
      expect(first.data.paths?.[0]?.[0]).toBeCloseTo(130, 10);
      expect(first.data.paths?.[0]?.[1]).toBeCloseTo(10, 10);
      expect(first.data.paths?.[0]?.[2]).toBeCloseTo(110, 10);
      expect(first.data.paths?.[0]?.[3]).toBeCloseTo(30, 10);
      expect(first.data.geometryVersion).toBe(2);
      expect(first.data.normalizedGeometry).toBeDefined();
    });

    it('matches legacy rectangle rotation outputs for 90/180/270 degrees', () => {
      const annotation: PdfAnnotation = {
        ...createMockAnnotation('legacy-match', 1),
        rect: { x: 10, y: 15, width: 40, height: 25 },
      };

      const [rot90] = remapAfterRotate([annotation], [{ pageIndex: 0, angle: 90, width: 200, height: 150 }]);
      const [rot180] = remapAfterRotate([annotation], [{ pageIndex: 0, angle: 180, width: 200, height: 150 }]);
      const [rot270] = remapAfterRotate([annotation], [{ pageIndex: 0, angle: 270, width: 200, height: 150 }]);

      expectRectClose(rot90.rect, { x: 110, y: 10, width: 25, height: 40 });
      expectRectClose(rot180.rect, { x: 150, y: 110, width: 40, height: 25 });
      expectRectClose(rot270.rect, { x: 15, y: 150, width: 25, height: 40 });
    });
  });
});
