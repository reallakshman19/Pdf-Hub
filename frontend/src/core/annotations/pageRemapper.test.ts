import { describe, it, expect } from 'vitest';
import { remapAfterReorder, remapAfterDelete, remapAfterInsert, remapAfterRotate, remapAfterDuplicate, remapAfterReplace } from './pageRemapper';
import type { PdfAnnotation } from './types';

describe('pageRemapper', () => {
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
    it('transforms rect by 90 degrees on a 200×100 page', () => {
      const annotations = [{
        ...createMockAnnotation('a', 1),
        rect: { x: 10, y: 20, width: 50, height: 30 },
      }];
      const remapped = remapAfterRotate(annotations, [
        { pageIndex: 0, angle: 90, width: 200, height: 100 },
      ]);
      // 90°: newRect = { x: H - y - h, y: x, width: h, height: w }
      //             = { x: 100 - 20 - 30, y: 10, width: 30, height: 50 }
      expect(remapped[0].rect).toEqual({ x: 50, y: 10, width: 30, height: 50 });
    });

    it('transforms rect by 180 degrees', () => {
      const annotations = [{
        ...createMockAnnotation('a', 1),
        rect: { x: 10, y: 20, width: 50, height: 30 },
      }];
      const remapped = remapAfterRotate(annotations, [
        { pageIndex: 0, angle: 180, width: 200, height: 100 },
      ]);
      // 180°: newRect = { x: W - x - w, y: H - y - h, width: w, height: h }
      //              = { x: 200 - 10 - 50, y: 100 - 20 - 30, width: 50, height: 30 }
      expect(remapped[0].rect).toEqual({ x: 140, y: 50, width: 50, height: 30 });
    });

    it('transforms rect by 270 degrees', () => {
      const annotations = [{
        ...createMockAnnotation('a', 1),
        rect: { x: 10, y: 20, width: 50, height: 30 },
      }];
      const remapped = remapAfterRotate(annotations, [
        { pageIndex: 0, angle: 270, width: 200, height: 100 },
      ]);
      // 270°: newRect = { x: y, y: W - x - w, width: h, height: w }
      //              = { x: 20, y: 200 - 10 - 50, width: 30, height: 50 }
      expect(remapped[0].rect).toEqual({ x: 20, y: 140, width: 30, height: 50 });
    });

    it('does not affect annotations on other pages', () => {
      const annotations = [
        createMockAnnotation('p1', 1),
        createMockAnnotation('p2', 2),
      ];
      const remapped = remapAfterRotate(annotations, [
        { pageIndex: 0, angle: 90, width: 200, height: 100 },
      ]);
      expect(remapped.find(a => a.id === 'p2')?.rect).toEqual(annotations[1].rect);
    });

    it('returns unchanged array when rotations is empty', () => {
      const annotations = [createMockAnnotation('a', 1)];
      expect(remapAfterRotate(annotations, [])).toBe(annotations);
    });
  });

  describe('remapAfterDuplicate', () => {
    it('copies annotations to the duplicate page with unique IDs', () => {
      const annotations = [
        createMockAnnotation('a', 1),
        createMockAnnotation('b', 2),
      ];
      let counter = 0;
      const createId = () => `new-${++counter}`;
      const remapped = remapAfterDuplicate(annotations, [0], createId);

      // Original page 1 should still exist
      const origA = remapped.find(a => a.id === 'a');
      expect(origA).toBeDefined();

      // A copy of page 1's annotation should appear on page 2 with a new ID
      const copy = remapped.find(a => a.id === 'new-1');
      expect(copy).toBeDefined();
      expect(copy?.pageNumber).toBe(2);

      // Page 2 annotation should shift to page 3
      expect(remapped.find(a => a.id === 'b')?.pageNumber).toBe(3);
    });

    it('generates unique IDs for each copied annotation', () => {
      const annotations = [
        createMockAnnotation('a', 1),
        createMockAnnotation('b', 1),
      ];
      const remapped = remapAfterDuplicate(annotations, [0]);
      const allIds = remapped.map(a => a.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('returns original array when pageIndices is empty', () => {
      const annotations = [createMockAnnotation('a', 1)];
      expect(remapAfterDuplicate(annotations, [])).toBe(annotations);
    });
  });

  describe('remapAfterReplace', () => {
    it('removes annotations on the replaced page by default', () => {
      const annotations = [
        createMockAnnotation('a', 1),
        createMockAnnotation('b', 2),
        createMockAnnotation('c', 3),
      ];
      // Replace page index 1 (1-based page 2)
      const remapped = remapAfterReplace(annotations, 1);
      expect(remapped.find(a => a.id === 'b')).toBeUndefined();
      expect(remapped).toHaveLength(2);
    });

    it('does not shift other page numbers', () => {
      const annotations = [
        createMockAnnotation('a', 1),
        createMockAnnotation('b', 2),
        createMockAnnotation('c', 3),
      ];
      const remapped = remapAfterReplace(annotations, 1);
      expect(remapped.find(a => a.id === 'a')?.pageNumber).toBe(1);
      expect(remapped.find(a => a.id === 'c')?.pageNumber).toBe(3);
    });

    it('preserves annotations when preserveAnnotations is true', () => {
      const annotations = [
        createMockAnnotation('a', 1),
        createMockAnnotation('b', 2),
      ];
      const remapped = remapAfterReplace(annotations, 0, true);
      expect(remapped).toBe(annotations);
    });
  });
});
