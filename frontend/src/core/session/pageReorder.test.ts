import { describe, it, expect } from 'vitest';
import { calculateNewPageOrder } from './pageReorder';

describe('calculateNewPageOrder', () => {
  it('moves a block before a target', () => {
    const result = calculateNewPageOrder(15, [3, 4, 5], 12, 'before');
    expect(result).toEqual([1, 2, 6, 7, 8, 9, 10, 11, 3, 4, 5, 12, 13, 14, 15]);
  });

  it('moves a block before a target (earlier target)', () => {
    const result = calculateNewPageOrder(15, [12, 13], 2, 'before');
    expect(result).toEqual([1, 12, 13, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15]);
  });

  it('moves a block after a target', () => {
    const result = calculateNewPageOrder(5, [1, 2], 4, 'after');
    expect(result).toEqual([3, 4, 1, 2, 5]);
  });

  it('appends a block', () => {
    const result = calculateNewPageOrder(5, [2, 3], 0, 'append');
    expect(result).toEqual([1, 4, 5, 2, 3]);
  });

  it('handles moving a block that contains the target (target is removed, defaults to append)', () => {
    // If target is in selected, it gets removed from remainingPages, indexOf returns -1
    // so it appends to the end by default in the current logic.
    const result = calculateNewPageOrder(5, [2, 3, 4], 3, 'before');
    expect(result).toEqual([1, 5, 2, 3, 4]);
  });
});
