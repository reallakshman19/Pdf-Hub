import { describe, expect, it } from 'vitest';
import {
  binarizeSauvola,
  buildIntegralImages,
  preprocessOcrImageData,
  rgbaToGrayscale,
  stretchContrast,
  unsharpMask,
} from '../ocrImagePreprocessor';

describe('ocrImagePreprocessor', () => {
  it('converts RGBA to 8-bit grayscale using Rec. 601 luma', () => {
    // 2x1 image: Pure red [255, 0, 0, 255] and Pure green [0, 255, 0, 255]
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);

    const gray = rgbaToGrayscale(rgba, 2, 1);
    expect(gray.length).toBe(2);
    // 0.299 * 255 = ~76
    expect(gray[0]).toBe(76);
    // 0.587 * 255 = ~150
    expect(gray[1]).toBe(150);
  });

  it('stretches low-contrast images to full [0, 255] dynamic range', () => {
    // An image with all pixels compressed in range [100, 150]
    const gray = new Uint8Array([100, 110, 120, 130, 140, 150]);
    const stretched = stretchContrast(gray, 0.0, 1.0);

    // Minimum should be 0, maximum should be 255
    expect(stretched[0]).toBe(0);
    expect(stretched[stretched.length - 1]).toBe(255);
  });

  it('computes exact 2D integral images for O(1) local sums', () => {
    // 2x2 image:
    // [1, 2]
    // [3, 4]
    const gray = new Uint8Array([1, 2, 3, 4]);
    const { integral, stride } = buildIntegralImages(gray, 2, 2);

    expect(stride).toBe(3);
    // Integral image is 3x3:
    // (0,0)=0, (1,1)=1, (2,1)=3, (1,2)=4, (2,2)=10
    expect(integral[0]).toBe(0);
    expect(integral[1 * stride + 1]).toBe(1);
    expect(integral[1 * stride + 2]).toBe(3);
    expect(integral[2 * stride + 1]).toBe(4);
    expect(integral[2 * stride + 2]).toBe(10);
  });

  it('binarizes text against background using Sauvola adaptive thresholding', () => {
    // Create an 8x8 image with a bright background (220) and dark text (50) in the middle
    const width = 8;
    const height = 8;
    const gray = new Uint8Array(width * height).fill(220);

    // Place dark pixels in the center
    gray[3 * width + 3] = 50;
    gray[3 * width + 4] = 50;
    gray[4 * width + 3] = 50;
    gray[4 * width + 4] = 50;

    const binary = binarizeSauvola(gray, width, height, {
      windowRadius: 3,
      k: 0.2,
    });

    // Dark text pixels must be classified as 0 (foreground)
    expect(binary[3 * width + 3]).toBe(0);
    expect(binary[3 * width + 4]).toBe(0);
    expect(binary[4 * width + 3]).toBe(0);
    expect(binary[4 * width + 4]).toBe(0);

    // Background corners must be classified as 255 (background)
    expect(binary[0]).toBe(255);
    expect(binary[width - 1]).toBe(255);
    expect(binary[(height - 1) * width]).toBe(255);
  });

  it('sharpens edge transitions with unsharp mask', () => {
    const width = 5;
    const height = 5;
    const gray = new Uint8Array(width * height).fill(100);

    // Center pixel is a bright spot
    gray[2 * width + 2] = 200;

    const sharpened = unsharpMask(gray, width, height, 0.5);

    // Center pixel should be boosted further
    expect(sharpened[2 * width + 2]).toBeGreaterThan(200);
  });

  it('preprocesses ImageData in place without changing canvas dimensions', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);

    // Make top-left pixel dark
    data[0] = 30;
    data[1] = 30;
    data[2] = 30;
    data[3] = 255;

    const mockImageData = {
      width,
      height,
      data,
      colorSpace: 'srgb' as const,
    };

    const result = preprocessOcrImageData(mockImageData, { mode: 'sauvola' });

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    // Dark pixel should become 0 (black text)
    expect(result.data[0]).toBe(0);
    expect(result.data[1]).toBe(0);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(255);

    // Bright pixel should become 255 (white background)
    expect(result.data[4]).toBe(255);
    expect(result.data[5]).toBe(255);
    expect(result.data[6]).toBe(255);
  });

  it('supports contrast-only preprocessing mode', () => {
    const width = 4;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i += 1) {
      const val = 100 + i * 5;
      data[i * 4] = val;
      data[i * 4 + 1] = val;
      data[i * 4 + 2] = val;
      data[i * 4 + 3] = 255;
    }

    const mockImageData = {
      width,
      height,
      data,
      colorSpace: 'srgb' as const,
    };

    const result = preprocessOcrImageData(mockImageData, { mode: 'contrast' });

    expect(result.width).toBe(width);
    // Contrast mode produces stretched grayscale values in RGB, preserving alpha 255
    expect(result.data[3]).toBe(255);
    expect(result.data[0]).toBe(0); // lowest is stretched to 0
    expect(result.data[(width * height - 1) * 4]).toBe(255); // highest to 255
  });

  it('passes through unchanged when mode is none', () => {
    const width = 2;
    const height = 2;
    const data = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
      100, 110, 120, 255,
    ]);

    const mockImageData = {
      width,
      height,
      data,
      colorSpace: 'srgb' as const,
    };

    const result = preprocessOcrImageData(mockImageData, { mode: 'none' });

    expect(result.data[0]).toBe(10);
    expect(result.data[1]).toBe(20);
    expect(result.data[2]).toBe(30);
  });
});
