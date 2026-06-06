import { describe, expect, it } from 'vitest';
import { applyWriterRectSnap } from '../writerSnapGuides';

describe('writerSnapGuides', () => {
  it('snaps near page left and bottom edges', () => {
    const result = applyWriterRectSnap(
      { x: 4, y: 5, width: 100, height: 40 },
      { pageWidth: 600, pageHeight: 800, threshold: 6 },
    );

    expect(result.rect.x).toBe(0);
    expect(result.rect.y).toBe(0);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
  });

  it('snaps near page center', () => {
    const result = applyWriterRectSnap(
      { x: 253, y: 379, width: 100, height: 40 },
      { pageWidth: 600, pageHeight: 800, threshold: 6 },
    );

    expect(result.rect.x).toBe(250);
    expect(result.rect.y).toBe(380);
  });

  it('snaps near right and top margins', () => {
    const result = applyWriterRectSnap(
      { x: 431, y: 690, width: 100, height: 40 },
      {
        pageWidth: 600,
        pageHeight: 800,
        threshold: 6,
        margins: {
          top: 72,
          right: 72,
          bottom: 72,
          left: 72,
        },
      },
    );

    expect(result.rect.x).toBe(428);
    expect(result.rect.y).toBe(688);
  });

  it('does not snap outside threshold', () => {
    const result = applyWriterRectSnap(
      { x: 20, y: 20, width: 100, height: 40 },
      { pageWidth: 600, pageHeight: 800, threshold: 6 },
    );

    expect(result.rect.x).toBe(20);
    expect(result.rect.y).toBe(20);
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
  });
});
