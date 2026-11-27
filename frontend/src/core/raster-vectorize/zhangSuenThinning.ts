/**
 * Zhang-Suen thinning (skeletonization) for binary images.
 *
 * Reduces foreground (value = 1) blobs to their 1-pixel-wide medial axes
 * ("skeletons") while preserving topology.  The algorithm is iterative and
 * fully in-place (no DOM, no pdfjs dependencies).
 *
 * Reference: Zhang, T.Y. and Suen, C.Y. (1984).  "A fast parallel algorithm
 * for thinning digital patterns."  Commun. ACM 27(3), pp. 236-239.
 */

/** @internal Neighbourhood accessor — returns the 8 neighbours as P2…P9. */
function neighbours(data: Uint8Array, idx: number, w: number): [number, number, number, number, number, number, number, number] {
  return [
    data[idx - w],         // P2 — N
    data[idx - w + 1],     // P3 — NE
    data[idx + 1],         // P4 — E
    data[idx + w + 1],     // P5 — SE
    data[idx + w],         // P6 — S
    data[idx + w - 1],     // P7 — SW
    data[idx - 1],         // P8 — W
    data[idx - w - 1],     // P9 — NW
  ];
}

/** @internal Count 0→1 transitions in P2…P9 (circular). */
function transitions(ns: ReturnType<typeof neighbours>): number {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (ns[i] === 0 && ns[(i + 1) % 8] === 1) count++;
  }
  return count;
}

/** @internal Sum of all 8 neighbours. */
function neighbourSum(ns: ReturnType<typeof neighbours>): number {
  return ns[0] + ns[1] + ns[2] + ns[3] + ns[4] + ns[5] + ns[6] + ns[7];
}

/**
 * Run Zhang-Suen thinning on a binary image.
 *
 * @param binary  - Input Uint8Array where `1` = foreground, `0` = background.
 *                  Values are read but NOT modified; a fresh copy is returned.
 * @param width   - Image width in pixels.
 * @param height  - Image height in pixels.
 * @returns A new `Uint8Array` of the same size containing the skeleton.
 */
export function thinBinaryImage(
  binary: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const data = new Uint8Array(binary);   // working copy
  const toRemove = new Uint8Array(data.length);

  let changed = true;
  while (changed) {
    changed = false;

    // --- Sub-iteration 1 ---
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (data[idx] !== 1) continue;
        const ns = neighbours(data, idx, width);
        const s = neighbourSum(ns);
        if (s < 2 || s > 6) continue;
        if (transitions(ns) !== 1) continue;
        // Condition A: P2*P4*P6 = 0
        if (ns[0] * ns[2] * ns[4] !== 0) continue;
        // Condition B: P4*P6*P8 = 0
        if (ns[2] * ns[4] * ns[6] !== 0) continue;
        toRemove[idx] = 1;
      }
    }
    for (let i = 0; i < data.length; i++) {
      if (toRemove[i]) { data[i] = 0; toRemove[i] = 0; changed = true; }
    }

    // --- Sub-iteration 2 ---
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (data[idx] !== 1) continue;
        const ns = neighbours(data, idx, width);
        const s = neighbourSum(ns);
        if (s < 2 || s > 6) continue;
        if (transitions(ns) !== 1) continue;
        // Condition A: P2*P4*P8 = 0
        if (ns[0] * ns[2] * ns[6] !== 0) continue;
        // Condition B: P2*P6*P8 = 0
        if (ns[0] * ns[4] * ns[6] !== 0) continue;
        toRemove[idx] = 1;
      }
    }
    for (let i = 0; i < data.length; i++) {
      if (toRemove[i]) { data[i] = 0; toRemove[i] = 0; changed = true; }
    }
  }

  return data;
}
