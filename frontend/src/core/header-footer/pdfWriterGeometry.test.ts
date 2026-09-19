import { describe, expect, it } from 'vitest';

import {
  createHeaderFooterVisualGeometry,
  normalizeQuarterTurn,
  visualPointToPdf,
} from './pdfWriterGeometry';

describe('header/footer rotated-page visual geometry', () => {
  it('normalizes quarter turns', () => {
    expect(normalizeQuarterTurn(0)).toBe(0);
    expect(normalizeQuarterTurn(450)).toBe(90);
    expect(normalizeQuarterTurn(-90)).toBe(270);
    expect(() => normalizeQuarterTurn(45)).toThrow(/quarter turn/);
  });

  it('maps viewer-facing points into raw PDF coordinates for every rotation', () => {
    const width = 600;
    const height = 800;

    expect(
      visualPointToPdf(
        createHeaderFooterVisualGeometry(width, height, 0),
        10,
        20,
      ),
    ).toEqual({ x: 10, y: 20 });

    expect(
      visualPointToPdf(
        createHeaderFooterVisualGeometry(width, height, 90),
        10,
        20,
      ),
    ).toEqual({ x: 580, y: 10 });

    expect(
      visualPointToPdf(
        createHeaderFooterVisualGeometry(width, height, 180),
        10,
        20,
      ),
    ).toEqual({ x: 590, y: 780 });

    expect(
      visualPointToPdf(
        createHeaderFooterVisualGeometry(width, height, 270),
        10,
        20,
      ),
    ).toEqual({ x: 20, y: 790 });
  });

  it('swaps visual dimensions for 90/270-degree pages', () => {
    expect(
      createHeaderFooterVisualGeometry(600, 800, 90),
    ).toMatchObject({
      rawWidth: 600,
      rawHeight: 800,
      visualWidth: 800,
      visualHeight: 600,
      rotation: 90,
    });

    expect(
      createHeaderFooterVisualGeometry(600, 800, 270),
    ).toMatchObject({
      visualWidth: 800,
      visualHeight: 600,
      rotation: 270,
    });
  });
});
