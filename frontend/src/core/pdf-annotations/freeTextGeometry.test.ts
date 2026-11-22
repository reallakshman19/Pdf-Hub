import { describe, expect, it } from 'vitest';
import { calloutBodyRect, enclosingCalloutRect } from './freeTextGeometry';

describe('callout inner rectangle', () => {
  it('uses standard /RD ordering when the leader ends at that rectangle', () => {
    expect(calloutBodyRect([10, 100, 200, 240], [40, 0, 0, 100], [10, 100, 10, 150, 50, 220]))
      .toEqual([50, 200, 200, 240]);
  });

  it('recognizes the alternate vertical order used by the owner benchmark', () => {
    expect(calloutBodyRect([10, 100, 200, 240], [40, 100, 0, 0], [10, 100, 10, 150, 50, 220]))
      .toEqual([50, 200, 200, 240]);
  });

  it('defaults to the standard when no usable leader distinguishes the orders', () => {
    expect(calloutBodyRect([10, 100, 200, 240], [40, 0, 0, 100]))
      .toEqual([50, 200, 200, 240]);
  });

  it('produces a standard /RD that reconstructs the original text box', () => {
    const body: [number, number, number, number] = [50, 200, 200, 240];
    const leader = [10, 100, 10, 150, 50, 220];
    const outer = enclosingCalloutRect(body, leader);
    expect(calloutBodyRect(outer.rect, outer.rd, leader)).toEqual(body);
  });
});
