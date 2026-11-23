import { describe, it, expect } from 'vitest';
import {
  cropPdfMargins,
  calculateContentBoundingBoxFromRgba,
} from '../pdfMarginCropping';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('pdfMarginCropping', () => {
  describe('calculateContentBoundingBoxFromRgba', () => {
    it('returns full dimensions for entirely blank white canvas', () => {
      const width = 100;
      const height = 100;
      const data = new Uint8ClampedArray(width * height * 4);
      // Fill with white opaque pixels
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }

      const box = calculateContentBoundingBoxFromRgba(data, width, height, 400, 400, 10);
      expect(box.xPt).toBe(0);
      expect(box.yPt).toBe(0);
      expect(box.widthPt).toBe(400);
      expect(box.heightPt).toBe(400);
    });

    it('detects centered non-white box with padding', () => {
      const width = 100;
      const height = 100;
      const data = new Uint8ClampedArray(width * height * 4);
      // All white
      data.fill(255);

      // Draw black rectangle in center: x from 40 to 60, y from 40 to 60
      for (let y = 40; y <= 60; y++) {
        for (let x = 40; x <= 60; x++) {
          const idx = (y * width + x) * 4;
          data[idx] = 0; // r
          data[idx + 1] = 0; // g
          data[idx + 2] = 0; // b
          data[idx + 3] = 255; // a
        }
      }

      const box = calculateContentBoundingBoxFromRgba(data, width, height, 500, 500, 10);
      // canvas (40..60) -> scale 5 -> 200..305.
      // Left = 200 - 10 = 190.
      expect(box.xPt).toBe(190);
      expect(box.widthPt).toBeGreaterThanOrEqual(50);
      expect(box.heightPt).toBeGreaterThanOrEqual(50);
    });
  });

  describe('cropPdfMargins', () => {
    async function createTestPdf(): Promise<Uint8Array> {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page1 = doc.addPage([600, 800]);
      page1.drawText('Page 1 Content', { x: 100, y: 700 });
      const page2 = doc.addPage([600, 800]);
      page2.drawText('Page 2 Content', { x: 100, y: 700 });
      return await doc.save();
    }

    it('crops margins with uniform values and leaves MediaBox intact', async () => {
      const source = await createTestPdf();
      const result = await cropPdfMargins(source, {
        mode: 'uniform',
        uniformMargins: { topPt: 50, bottomPt: 50, leftPt: 40, rightPt: 40 },
        pageIndices: [0],
      });

      expect(result.croppedPageCount).toBe(1);

      const lib = await pdfLib();
      const verified = await lib.PDFDocument.load(result.modifiedBytes);
      const page1 = verified.getPage(0);
      const media = page1.getMediaBox();
      const crop = page1.getCropBox();

      // MediaBox unchanged
      expect(media.width).toBe(600);
      expect(media.height).toBe(800);

      // CropBox trimmed
      expect(crop.x).toBe(40);
      expect(crop.y).toBe(50);
      expect(crop.width).toBe(600 - 40 - 40);
      expect(crop.height).toBe(800 - 50 - 50);

      // Page 2 untrimmed
      const page2Crop = verified.getPage(1).getCropBox();
      expect(page2Crop.x).toBe(0);
      expect(page2Crop.width).toBe(600);
    });

    it('applies auto-detection bounding box when provided', async () => {
      const source = await createTestPdf();
      const result = await cropPdfMargins(source, {
        mode: 'auto',
        pageIndices: [0],
        detectedBoxes: {
          0: { xPt: 80, yPt: 120, widthPt: 440, heightPt: 560 },
        },
      });

      const lib = await pdfLib();
      const verified = await lib.PDFDocument.load(result.modifiedBytes);
      const crop = verified.getPage(0).getCropBox();

      expect(crop.x).toBe(80);
      expect(crop.y).toBe(120);
      expect(crop.width).toBe(440);
      expect(crop.height).toBe(560);
    });

    it('crops rotated pages (90 deg) mapping viewer edges correctly', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([600, 800]);
      page.setRotation(lib.degrees(90));
      const source = await doc.save();

      const result = await cropPdfMargins(source, {
        mode: 'uniform',
        uniformMargins: { topPt: 30, bottomPt: 20, leftPt: 10, rightPt: 40 },
        pageIndices: [0],
      });

      const verified = await lib.PDFDocument.load(result.modifiedBytes);
      const crop = verified.getPage(0).getCropBox();

      // Top (30) maps to unrotatedLeft -> x = 30
      // Bottom (20) maps to unrotatedRight -> width = 600 - 30 - 20 = 550
      // Right (40) maps to unrotatedTop
      // Left (10) maps to unrotatedBottom -> y = 10, height = 800 - 40 - 10 = 750
      expect(crop.x).toBe(30);
      expect(crop.y).toBe(10);
      expect(crop.width).toBe(550);
      expect(crop.height).toBe(750);
    });

    it('resets cropbox to mediabox when mode is reset', async () => {
      const source = await createTestPdf();
      // First crop
      const cropped = await cropPdfMargins(source, {
        mode: 'uniform',
        uniformMargins: { topPt: 60, bottomPt: 60, leftPt: 60, rightPt: 60 },
      });

      // Then reset
      const restored = await cropPdfMargins(cropped.modifiedBytes, {
        mode: 'reset',
        pageIndices: [0],
      });

      const lib = await pdfLib();
      const verified = await lib.PDFDocument.load(restored.modifiedBytes);
      const crop = verified.getPage(0).getCropBox();
      expect(crop.x).toBe(0);
      expect(crop.width).toBe(600);
      expect(crop.height).toBe(800);
    });

    it('throws error for empty source bytes', async () => {
      await expect(
        cropPdfMargins(new Uint8Array([]), { mode: 'auto' }),
      ).rejects.toThrow('Cannot crop margins of empty source bytes.');
    });
  });
});
