import { describe, it, expect } from 'vitest';
import { remapAfterReorder, remapAfterDelete, remapAfterInsert } from './pageRemapper';
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
});
