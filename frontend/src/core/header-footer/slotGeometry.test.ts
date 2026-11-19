import { describe, expect, it } from 'vitest';
import {
  assertNonOverlappingHeaderFooterSlots,
  headerFooterSlotX,
} from './slotGeometry';

describe('header/footer slot geometry', () => {
  it('positions left, center and right on the visual page', () => {
    expect(headerFooterSlotX('left', 40, 612, 36, 36)).toBe(36);
    expect(headerFooterSlotX('center', 40, 612, 36, 36)).toBe(286);
    expect(headerFooterSlotX('right', 40, 612, 36, 36)).toBe(536);
  });

  it('rejects overlapping slots even when individual widths fit page margins', () => {
    expect(() => assertNonOverlappingHeaderFooterSlots(
      [{ slot: 'left', widthPt: 322.93 }, { slot: 'center', widthPt: 326.25 }],
      612, 36, 36, 'header',
    )).toThrow(/overlap by 216.06pt/);
  });

  it('preserves three non-overlapping slots including rotated visual widths', () => {
    const entries = [
      { slot: 'left' as const, widthPt: 40 },
      { slot: 'center' as const, widthPt: 90 },
      { slot: 'right' as const, widthPt: 35 },
    ];
    expect(() => assertNonOverlappingHeaderFooterSlots(entries, 612, 36, 36, 'footer'))
      .not.toThrow();
    expect(() => assertNonOverlappingHeaderFooterSlots(entries, 792, 36, 36, 'footer'))
      .not.toThrow();
  });
});
