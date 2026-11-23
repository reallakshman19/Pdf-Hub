export type OcrPreprocessingMode =
  | 'none'
  | 'contrast'
  | 'sauvola'
  | 'unsharp-sauvola';

export interface OcrPreprocessingOptions {
  mode?: OcrPreprocessingMode;
  /** Sauvola window radius in pixels. Default is 15 (effective window size 31x31). */
  sauvolaWindowRadius?: number;
  /** Sauvola k parameter, typically between 0.1 and 0.5. Default is 0.2. */
  sauvolaK?: number;
  /** Contrast stretch low percentile (0 to 0.1). Default is 0.01 (1%). */
  contrastLowPercentile?: number;
  /** Contrast stretch high percentile (0.9 to 1.0). Default is 0.99 (99%). */
  contrastHighPercentile?: number;
  /** Unsharp mask weight (0 to 1.0). Default is 0.4. */
  unsharpAmount?: number;
}

/**
 * Converts RGBA pixel data to 8-bit luminance grayscale using standard Rec. 601 coefficients.
 */
export function rgbaToGrayscale(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);

  for (let i = 0, j = 0; i < pixelCount; i += 1, j += 4) {
    // Rec. 601 luma formula: Y = 0.299 R + 0.587 G + 0.114 B
    gray[i] = Math.round(
      0.299 * (rgba[j] ?? 0)
      + 0.587 * (rgba[j + 1] ?? 0)
      + 0.114 * (rgba[j + 2] ?? 0),
    );
  }

  return gray;
}

/**
 * Finds the intensity bin corresponding to the given percentile [0, 1] in a 256-bin histogram.
 */
export function findPercentileBin(
  histogram: Uint32Array,
  totalPixels: number,
  percentile: number,
): number {
  if (totalPixels === 0) return 0;
  const target = Math.min(
    totalPixels,
    Math.max(1, Math.ceil(totalPixels * Math.max(0, Math.min(1, percentile)))),
  );
  let count = 0;
  for (let i = 0; i < 256; i += 1) {
    count += histogram[i] ?? 0;
    if (count >= target) {
      return i;
    }
  }
  return 255;
}

/**
 * Normalizes image contrast by clipping extreme percentiles (e.g. 1% and 99%)
 * and linearly stretching the middle dynamic range across [0, 255].
 * Extremely effective for faint gray text on off-white or blueprint scans.
 */
export function stretchContrast(
  gray: Uint8Array,
  lowPercentile = 0.01,
  highPercentile = 0.99,
): Uint8Array {
  const len = gray.length;
  if (len === 0) return gray;

  const histogram = new Uint32Array(256);
  for (let i = 0; i < len; i += 1) {
    histogram[gray[i] ?? 0] += 1;
  }

  const pLow = findPercentileBin(histogram, len, lowPercentile);
  const pHigh = findPercentileBin(histogram, len, highPercentile);

  if (pHigh <= pLow) {
    return gray;
  }

  const output = new Uint8Array(len);
  const range = pHigh - pLow;

  for (let i = 0; i < len; i += 1) {
    const val = gray[i] ?? 0;
    if (val <= pLow) {
      output[i] = 0;
    } else if (val >= pHigh) {
      output[i] = 255;
    } else {
      output[i] = Math.round(((val - pLow) * 255) / range);
    }
  }

  return output;
}

/**
 * Builds standard 2D integral (summed-area) tables for constant-time O(1)
 * local mean and standard deviation queries across arbitrary window sizes.
 */
export function buildIntegralImages(
  gray: Uint8Array,
  width: number,
  height: number,
): {
  integral: Float64Array;
  integralSq: Float64Array;
  stride: number;
} {
  const stride = width + 1;
  const size = stride * (height + 1);
  const integral = new Float64Array(size);
  const integralSq = new Float64Array(size);

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let rowSqSum = 0;
    const grayRowOffset = y * width;
    const intRowOffset = (y + 1) * stride;
    const prevIntRowOffset = y * stride;

    for (let x = 0; x < width; x += 1) {
      const val = gray[grayRowOffset + x] ?? 0;
      rowSum += val;
      rowSqSum += val * val;

      const idx = intRowOffset + (x + 1);
      const prevIdx = prevIntRowOffset + (x + 1);

      integral[idx] = (integral[prevIdx] ?? 0) + rowSum;
      integralSq[idx] = (integralSq[prevIdx] ?? 0) + rowSqSum;
    }
  }

  return { integral, integralSq, stride };
}

/**
 * Applies Sauvola's adaptive binarization algorithm using precomputed integral images.
 * Threshold formula: T = mean * [1 + k * (stdDev / R - 1)]
 * where R = 128 (dynamic range divisor), k typically 0.2 to 0.4.
 *
 * This strips non-uniform illumination, scanner bleed-through, and blueprint grid
 * lines while maintaining continuous stroke connectivity for small characters.
 */
export function binarizeSauvola(
  gray: Uint8Array,
  width: number,
  height: number,
  options: {
    windowRadius?: number;
    k?: number;
    r?: number;
  } = {},
): Uint8Array {
  const radius = options.windowRadius ?? 15;
  const k = options.k ?? 0.2;
  const R = options.r ?? 128;
  const len = width * height;
  const output = new Uint8Array(len);

  const { integral, integralSq, stride } = buildIntegralImages(gray, width, height);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const rowOffset = y * width;

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);

      const count = (x1 - x0 + 1) * (y1 - y0 + 1);

      // Sum over [x0, x1] x [y0, y1] from integral image:
      const br = (y1 + 1) * stride + (x1 + 1);
      const bl = (y1 + 1) * stride + x0;
      const tr = y0 * stride + (x1 + 1);
      const tl = y0 * stride + x0;

      const sum = (integral[br] ?? 0) - (integral[bl] ?? 0) - (integral[tr] ?? 0) + (integral[tl] ?? 0);
      const sumSq = (integralSq[br] ?? 0) - (integralSq[bl] ?? 0) - (integralSq[tr] ?? 0) + (integralSq[tl] ?? 0);

      const mean = sum / count;
      const variance = Math.max(0, (sumSq / count) - (mean * mean));
      const stdDev = Math.sqrt(variance);

      // Sauvola formula:
      const threshold = mean * (1 + k * ((stdDev / R) - 1));
      const pixelVal = gray[rowOffset + x] ?? 0;

      // In OCR convention: 0 is dark text, 255 is light background
      output[rowOffset + x] = pixelVal < threshold ? 0 : 255;
    }
  }

  return output;
}

/**
 * 3x3 unsharp mask sharpening to enhance high-frequency character edges
 * on blurry or low-resolution vector rasterizations before binarization.
 */
export function unsharpMask(
  gray: Uint8Array,
  width: number,
  height: number,
  amount = 0.4,
): Uint8Array {
  if (width < 3 || height < 3) return gray;

  const output = new Uint8Array(gray.length);
  const clampedAmount = Math.max(0, Math.min(1.0, amount));

  for (let y = 0; y < height; y += 1) {
    const yPrev = Math.max(0, y - 1);
    const yNext = Math.min(height - 1, y + 1);

    for (let x = 0; x < width; x += 1) {
      const xPrev = Math.max(0, x - 1);
      const xNext = Math.min(width - 1, x + 1);

      const center = gray[y * width + x] ?? 0;
      // 3x3 box blur sample:
      const blur = (
        (gray[yPrev * width + xPrev] ?? 0) + (gray[yPrev * width + x] ?? 0) + (gray[yPrev * width + xNext] ?? 0)
        + (gray[y * width + xPrev] ?? 0) + center + (gray[y * width + xNext] ?? 0)
        + (gray[yNext * width + xPrev] ?? 0) + (gray[yNext * width + x] ?? 0) + (gray[yNext * width + xNext] ?? 0)
      ) / 9;

      // High-pass difference added back to center:
      const sharpened = center + clampedAmount * (center - blur);
      output[y * width + x] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
  }

  return output;
}

/**
 * Preprocesses an HTML/Offscreen ImageData buffer in-place before OCR encoding.
 * Operates strictly on pixel colors without altering canvas dimensions,
 * preserving exact inverse affine transformations and PDF geometry.
 */
export function preprocessOcrImageData(
  imageData: ImageData,
  options: OcrPreprocessingOptions = {},
): ImageData {
  const mode = options.mode ?? 'sauvola';
  if (mode === 'none') {
    return imageData;
  }

  const { width, height, data } = imageData;
  let gray = rgbaToGrayscale(data, width, height);

  // 1. Contrast stretching
  gray = stretchContrast(
    gray,
    options.contrastLowPercentile ?? 0.01,
    options.contrastHighPercentile ?? 0.99,
  );

  if (mode === 'contrast') {
    // Write enhanced grayscale back to RGBA channels
    for (let i = 0, j = 0; i < gray.length; i += 1, j += 4) {
      const g = gray[i] ?? 0;
      data[j] = g;
      data[j + 1] = g;
      data[j + 2] = g;
      data[j + 3] = 255;
    }
    return imageData;
  }

  // 2. Unsharp sharpening (if requested)
  if (mode === 'unsharp-sauvola') {
    gray = unsharpMask(gray, width, height, options.unsharpAmount ?? 0.4);
  }

  // 3. Sauvola Adaptive Binarization
  const binary = binarizeSauvola(gray, width, height, {
    windowRadius: options.sauvolaWindowRadius,
    k: options.sauvolaK,
  });

  // Write crisp black/white result back to RGBA
  for (let i = 0, j = 0; i < binary.length; i += 1, j += 4) {
    const b = binary[i] ?? 255;
    data[j] = b;
    data[j + 1] = b;
    data[j + 2] = b;
    data[j + 3] = 255;
  }

  return imageData;
}
