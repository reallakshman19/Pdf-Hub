import { describe, it, expect } from 'vitest';
import { binarizeGrayscale, binarizeOtsu, binarizeBradley } from '../imageThreshold';

/** Build a flat Uint8ClampedArray from a 2-D grid of values. */
function makeGray(grid: number[][]): { pixels: Uint8ClampedArray; w: number; h: number } {
  const h = grid.length;
  const w = grid[0].length;
  const pixels = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      pixels[y * w + x] = grid[y][x];
    }
  }
  return { pixels, w, h };
}

describe('binarizeOtsu', () => {
  it('separates a bimodal image into foreground and background', () => {
    // 4x4 image: left half dark (10), right half light (245)
    const { pixels } = makeGray([
      [10, 10, 245, 245],
      [10, 10, 245, 245],
      [10, 10, 245, 245],
      [10, 10, 245, 245],
    ]);
    const result = binarizeOtsu(pixels);
    // dark pixels should be foreground (1), light pixels background (0)
    expect(result[0]).toBe(1);  // top-left dark
    expect(result[2]).toBe(0);  // top-right light
  });

  it('outputs only 0 and 1 values', () => {
    const { pixels } = makeGray([
      [100, 200],
      [50, 240],
    ]);
    const result = binarizeOtsu(pixels);
    for (const v of result) {
      expect(v === 0 || v === 1).toBe(true);
    }
  });

  it('returns a valid binary array for a uniform image', () => {
    // When all pixels are identical the Otsu loop exits early (wF === 0)
    // so threshold stays at 0.  Pixels with value 5 are > 0 → all background.
    // The important invariant is that the output is valid binary data.
    const { pixels } = makeGray([[5, 5], [5, 5]]);
    const result = binarizeOtsu(pixels);
    for (const v of result) {
      expect(v === 0 || v === 1).toBe(true);
    }
    // Length must match input
    expect(result.length).toBe(pixels.length);
  });
});

describe('binarizeBradley', () => {
  it('handles non-uniform illumination (gradient background)', () => {
    // Create a 10x10 image with a gradient background and a dark "line"
    const grid: number[][] = [];
    for (let y = 0; y < 10; y++) {
      const row: number[] = [];
      for (let x = 0; x < 10; x++) {
        // Background: brighter on the right (gradient 180→240)
        // Line: column x=4 is significantly darker
        row.push(x === 4 ? 20 : 180 + x * 6);
      }
      grid.push(row);
    }
    const { pixels, w, h } = makeGray(grid);
    const result = binarizeBradley(pixels, w, h, 0.3, 0.1);
    // Column 4 (the dark line) should be largely foreground
    let lineFgCount = 0;
    for (let y = 0; y < h; y++) {
      if (result[y * w + 4] === 1) lineFgCount++;
    }
    expect(lineFgCount).toBeGreaterThan(5);
  });

  it('outputs only 0 and 1 values', () => {
    const { pixels, w, h } = makeGray([
      [80, 160, 40],
      [200, 100, 50],
      [30, 180, 220],
    ]);
    const result = binarizeBradley(pixels, w, h);
    for (const v of result) {
      expect(v === 0 || v === 1).toBe(true);
    }
  });
});

describe('binarizeGrayscale (dispatcher)', () => {
  it('delegates to Otsu when method is "otsu"', () => {
    const { pixels, w, h } = makeGray([[10, 245]]);
    const a = binarizeGrayscale(pixels, w, h, 'otsu');
    const b = binarizeOtsu(pixels);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('delegates to Bradley when method is "bradley"', () => {
    const { pixels, w, h } = makeGray([[10, 10, 245, 245], [10, 10, 245, 245]]);
    const a = binarizeGrayscale(pixels, w, h, 'bradley', 0.3, 0.1);
    const b = binarizeBradley(pixels, w, h, 0.3, 0.1);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
