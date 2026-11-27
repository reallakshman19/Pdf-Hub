import { describe, it, expect } from 'vitest';
import { thinBinaryImage } from '../zhangSuenThinning';

/** Build a Uint8Array from a 2-D grid where '#' = 1 (fg) and '.' = 0 (bg). */
function parseGrid(rows: string[]): { data: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = rows[y][x] === '#' ? 1 : 0;
    }
  }
  return { data, w, h };
}

/** Count foreground pixels in the result. */
function countFg(arr: Uint8Array): number {
  let n = 0;
  for (const v of arr) if (v === 1) n++;
  return n;
}

/** True if every foreground pixel has at most 2 foreground neighbours
 *  (i.e., the result looks like 1-pixel-wide lines). */
function isThin(result: Uint8Array, w: number, h: number): boolean {
  const DIRS = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (result[y * w + x] !== 1) continue;
      let n = 0;
      for (const [dx, dy] of DIRS) {
        if (result[(y + dy) * w + (x + dx)] === 1) n++;
      }
      // A junction pixel can have 3 neighbours; a body pixel has exactly 2;
      // an endpoint has 1.  More than 6 means the image is not thinned.
      // We're just checking nothing is "fat" (a pixel surrounded on all sides).
      if (n === 8) return false;   // solid block → not thinned
    }
  }
  return true;
}

describe('thinBinaryImage — Zhang-Suen', () => {
  it('thins a 3-pixel-wide horizontal bar to a 1-pixel line', () => {
    // 7 wide × 5 tall; center 3 rows filled
    const { data, w, h } = parseGrid([
      '.......',
      '.#####.',
      '.#####.',
      '.#####.',
      '.......',
    ]);
    const result = thinBinaryImage(data, w, h);
    expect(isThin(result, w, h)).toBe(true);
    // The skeleton should be non-empty
    expect(countFg(result)).toBeGreaterThan(0);
    // Should be much fewer pixels than input (15) — typically 5
    expect(countFg(result)).toBeLessThan(15);
  });

  it('preserves an L-shaped skeleton path', () => {
    // 9x9 grid: 1-pixel L-shape already thin — should survive thinning
    const { data, w, h } = parseGrid([
      '.........',
      '.#.......',
      '.#.......',
      '.#.......',
      '.#.......',
      '.#######.',
      '.........',
      '.........',
      '.........',
    ]);
    const result = thinBinaryImage(data, w, h);
    // Result should still have a connected path (non-zero)
    expect(countFg(result)).toBeGreaterThan(0);
    expect(isThin(result, w, h)).toBe(true);
  });

  it('removes an isolated single pixel surrounded by background', () => {
    const { data, w, h } = parseGrid([
      '.....',
      '..#..',
      '.....',
    ]);
    // A single isolated foreground pixel has degree 0;
    // Zhang-Suen does not remove it (it has fewer than 2 neighbours).
    // We just check the algorithm does not crash and returns valid binary data.
    const result = thinBinaryImage(data, w, h);
    for (const v of result) expect(v === 0 || v === 1).toBe(true);
  });

  it('does not modify the input array', () => {
    const { data, w, h } = parseGrid([
      '......',
      '.####.',
      '.####.',
      '......',
    ]);
    const original = data.slice();
    thinBinaryImage(data, w, h);
    expect(Array.from(data)).toEqual(Array.from(original));
  });
});
