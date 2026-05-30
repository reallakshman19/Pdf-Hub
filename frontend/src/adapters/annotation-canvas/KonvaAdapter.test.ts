import { describe, expect, it } from 'vitest';
import { toLocalAnnotationPoints } from './KonvaAdapter';

describe('toLocalAnnotationPoints', () => {
  it('preserves points that are already local to the annotation rect', () => {
    expect(toLocalAnnotationPoints([0, 20, 180, 20], 100, 200, 180, 40)).toEqual([0, 20, 180, 20]);
  });

  it('converts absolute page points to local annotation coordinates', () => {
    expect(toLocalAnnotationPoints([100, 220, 280, 220], 100, 200, 180, 40)).toEqual([0, 20, 180, 20]);
  });
});
