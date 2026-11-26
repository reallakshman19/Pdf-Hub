/**
 * Grayscale-image binarization helpers.
 *
 * Both algorithms operate on a flattened Uint8ClampedArray where every element
 * is a grayscale luminance value (0 = black, 255 = white).  They return a
 * Uint8Array of the same length where 0 = background and 1 = foreground
 * (the dark line pixels we want to trace).
 *
 * No DOM dependencies — safe to call inside a Web Worker.
 */

/** @internal Compute the global Otsu threshold for a grayscale histogram. */
function otsuThreshold(pixels: Uint8ClampedArray): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < pixels.length; i++) {
    hist[pixels[i]]++;
  }
  const total = pixels.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Binarize a grayscale image using Otsu's global threshold.
 *
 * Returns a `Uint8Array` where `1` = foreground (dark lines) and `0` = background.
 *
 * @param pixels - Flat grayscale luminance values, one byte per pixel.
 */
export function binarizeOtsu(
  pixels: Uint8ClampedArray,
): Uint8Array {
  const t = otsuThreshold(pixels);
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    out[i] = pixels[i] <= t ? 1 : 0;
  }
  return out;
}

/**
 * Binarize a grayscale image using Bradley's local adaptive threshold.
 *
 * Better than Otsu when illumination varies across the image (common in
 * scanned P&IDs photographed under uneven lighting).
 *
 * @param pixels    - Flat grayscale luminance values.
 * @param width     - Image width in pixels.
 * @param height    - Image height in pixels.
 * @param windowFraction - Window radius as a fraction of `min(width, height)`.
 *                         Typical: 0.08.
 * @param T         - Sensitivity constant (0–1).  Lower = less aggressive.
 *                    Typical: 0.15.
 */
export function binarizeBradley(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  windowFraction = 0.08,
  T = 0.15,
): Uint8Array {
  const radius = Math.max(1, Math.round(Math.min(width, height) * windowFraction));
  const n = width * height;

  // Build 2-D integral image (summed area table) using floating-point to
  // avoid overflow on large images.
  const integral = new Float64Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = pixels[idx];
      const above = y > 0 ? integral[(y - 1) * width + x] : 0;
      const left = x > 0 ? integral[idx - 1] : 0;
      const diagAboveLeft = y > 0 && x > 0 ? integral[(y - 1) * width + (x - 1)] : 0;
      integral[idx] = val + above + left - diagAboveLeft;
    }
  }

  const out = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[y2 * width + x2] -
        (y1 > 0 ? integral[(y1 - 1) * width + x2] : 0) -
        (x1 > 0 ? integral[y2 * width + (x1 - 1)] : 0) +
        (y1 > 0 && x1 > 0 ? integral[(y1 - 1) * width + (x1 - 1)] : 0);
      const idx = y * width + x;
      // Foreground if pixel is sufficiently darker than the local mean.
      out[idx] = pixels[idx] * count <= sum * (1 - T) ? 1 : 0;
    }
  }
  return out;
}

/**
 * Binarize a grayscale image using the requested method.
 *
 * @param pixels  - Flat grayscale luminance values, one byte per pixel.
 * @param width   - Image width in pixels.
 * @param height  - Image height in pixels.
 * @param method  - `'otsu'` (default) or `'bradley'`.
 * @param windowFraction - Bradley-only; fraction of shorter dimension for the window radius.
 * @param bradleyT       - Bradley-only; sensitivity constant.
 */
export function binarizeGrayscale(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  method: 'otsu' | 'bradley' = 'otsu',
  windowFraction = 0.08,
  bradleyT = 0.15,
): Uint8Array {
  if (method === 'bradley') {
    return binarizeBradley(pixels, width, height, windowFraction, bradleyT);
  }
  return binarizeOtsu(pixels);
}
