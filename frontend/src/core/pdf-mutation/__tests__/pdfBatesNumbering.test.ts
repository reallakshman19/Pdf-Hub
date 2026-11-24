import { describe, it, expect } from 'vitest';
import { applyBatesNumbering, formatBatesNumber } from '../pdfBatesNumbering';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('pdfBatesNumbering', () => {
  describe('formatBatesNumber', () => {
    it('pads sequential numbers with leading zeros', () => {
      expect(formatBatesNumber(1, 'DOC-', 4)).toBe('DOC-0001');
      expect(formatBatesNumber(42, 'DOC-', 6)).toBe('DOC-000042');
      expect(formatBatesNumber(999, 'BATES-', 3)).toBe('BATES-999');
      expect(formatBatesNumber(1000, 'BATES-', 3)).toBe('BATES-1000');
    });

    it('attaches prefix and suffix accurately', () => {
      expect(formatBatesNumber(7, 'DWG-CAESAR-', 3, '-REV-B')).toBe('DWG-CAESAR-007-REV-B');
      expect(formatBatesNumber(0, '', 5, '')).toBe('00000');
    });

    it('handles negative or decimal inputs safely by floor and clamp', () => {
      expect(formatBatesNumber(-5, 'ITEM-', 3)).toBe('ITEM-000');
      expect(formatBatesNumber(12.8, 'ITEM-', 3)).toBe('ITEM-012');
    });
  });

  describe('applyBatesNumbering', () => {
    async function createTestPdf(pageCount: number = 3, rotation: number = 0): Promise<Uint8Array> {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      for (let i = 0; i < pageCount; i++) {
        const page = doc.addPage([500, 700]);
        if (rotation !== 0) {
          page.setRotation(lib.degrees(rotation));
        }
      }
      return await doc.save();
    }

    it('applies sequential Bates stamps to all pages by default', async () => {
      const source = await createTestPdf(3);
      const result = await applyBatesNumbering(source, {
        prefix: 'DWG-00',
        startNumber: 1,
        digits: 3,
        position: 'bottom-right',
      });

      expect(result.stampedPageCount).toBe(3);
      expect(result.sampleFirstStamp).toBe('DWG-00001');

      const lib = await pdfLib();
      const verified = await lib.PDFDocument.load(result.modifiedBytes);
      expect(verified.getPageCount()).toBe(3);
    });

    it('stamps only selected page indices when specified', async () => {
      const source = await createTestPdf(4);
      const result = await applyBatesNumbering(source, {
        prefix: 'PAGE-',
        startNumber: 10,
        digits: 4,
        pageIndices: [1, 3],
      });

      expect(result.stampedPageCount).toBe(2);
      expect(result.sampleFirstStamp).toBe('PAGE-0010');
    });

    it('handles rotated pages correctly without throwing', async () => {
      const source90 = await createTestPdf(2, 90);
      const result90 = await applyBatesNumbering(source90, {
        prefix: 'ROT90-',
        startNumber: 1,
        position: 'top-right',
      });
      expect(result90.stampedPageCount).toBe(2);

      const source180 = await createTestPdf(2, 180);
      const result180 = await applyBatesNumbering(source180, {
        prefix: 'ROT180-',
        startNumber: 1,
        position: 'bottom-left',
      });
      expect(result180.stampedPageCount).toBe(2);

      const source270 = await createTestPdf(2, 270);
      const result270 = await applyBatesNumbering(source270, {
        prefix: 'ROT270-',
        startNumber: 1,
        position: 'top-center',
      });
      expect(result270.stampedPageCount).toBe(2);
    });

    it('positions stamps accurately relative to displaced CropBox offsets', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([600, 800]);
      page.setCropBox(50, 80, 500, 700);
      const source = await doc.save();

      const result = await applyBatesNumbering(source, {
        prefix: 'CROP-',
        startNumber: 1,
        position: 'bottom-left',
        marginXPt: 20,
        marginYPt: 30,
      });

      expect(result.stampedPageCount).toBe(1);
      const verified = await lib.PDFDocument.load(result.modifiedBytes);
      const verifiedCrop = verified.getPage(0).getCropBox();
      expect(verifiedCrop.x).toBe(50);
      expect(verifiedCrop.y).toBe(80);
    });

    it('aborts when signal is pre-aborted', async () => {
      const source = await createTestPdf(2);
      const controller = new AbortController();
      controller.abort();

      await expect(
        applyBatesNumbering(source, {
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it('throws error when applied to empty source bytes', async () => {
      await expect(
        applyBatesNumbering(new Uint8Array([]), {}),
      ).rejects.toThrow('Cannot apply Bates numbering to empty source bytes.');
    });

    it('throws error when target page indices are completely out of range', async () => {
      const source = await createTestPdf(2);
      await expect(
        applyBatesNumbering(source, { pageIndices: [10, 20] }),
      ).rejects.toThrow('No valid target pages found for Bates numbering.');
    });
  });
});
