import { describe, expect, it } from 'vitest';
import {
  normalizePdfPageDimensions,
  PRESET_DIMENSIONS,
} from './pdfNormalization';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('normalizePdfPageDimensions', () => {
  it('normalizes all pages to standard A4 dimensions with fit strategy', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([400, 600]);
    doc.addPage([800, 1000]);
    const sourceBytes = await doc.save();

    const result = await normalizePdfPageDimensions(sourceBytes, {
      preset: 'A4',
      strategy: 'fit',
    });

    expect(result.modifiedPageCount).toBe(2);
    expect(result.targetDimensions).toEqual(PRESET_DIMENSIONS.A4);

    const loaded = await lib.PDFDocument.load(result.normalizedBytes);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(0).getWidth()).toBeCloseTo(PRESET_DIMENSIONS.A4.width, 1);
    expect(loaded.getPage(0).getHeight()).toBeCloseTo(PRESET_DIMENSIONS.A4.height, 1);
    expect(loaded.getPage(1).getWidth()).toBeCloseTo(PRESET_DIMENSIONS.A4.width, 1);
    expect(loaded.getPage(1).getHeight()).toBeCloseTo(PRESET_DIMENSIONS.A4.height, 1);
  });

  it('normalizes to MatchFirstPage dimensions with center strategy', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([500, 750]); // First page is 500x750
    doc.addPage([300, 400]); // Second page
    const sourceBytes = await doc.save();

    const result = await normalizePdfPageDimensions(sourceBytes, {
      preset: 'MatchFirstPage',
      strategy: 'center',
    });

    expect(result.targetDimensions).toEqual({ width: 500, height: 750 });

    const loaded = await lib.PDFDocument.load(result.normalizedBytes);
    expect(loaded.getPage(1).getWidth()).toBe(500);
    expect(loaded.getPage(1).getHeight()).toBe(750);
  });

  it('normalizes selective page indices only', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([100, 100]);
    doc.addPage([200, 200]);
    doc.addPage([300, 300]);
    const sourceBytes = await doc.save();

    const result = await normalizePdfPageDimensions(sourceBytes, {
      preset: 'Letter',
      strategy: 'expand',
      pageIndices: [1],
    });

    expect(result.modifiedPageCount).toBe(1);

    const loaded = await lib.PDFDocument.load(result.normalizedBytes);
    // Page 0 unchanged
    expect(loaded.getPage(0).getWidth()).toBe(100);
    // Page 1 normalized to Letter
    expect(loaded.getPage(1).getWidth()).toBe(PRESET_DIMENSIONS.Letter.width);
    expect(loaded.getPage(1).getHeight()).toBe(PRESET_DIMENSIONS.Letter.height);
    // Page 2 unchanged
    expect(loaded.getPage(2).getWidth()).toBe(300);
  });

  it('preserves page orientation (landscape stays landscape) when requested', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([800, 400]); // Landscape page
    const sourceBytes = await doc.save();

    const result = await normalizePdfPageDimensions(sourceBytes, {
      preset: 'A4', // A4 default is portrait (595.28 x 841.89)
      strategy: 'fit',
      orientation: 'preserve',
    });

    const loaded = await lib.PDFDocument.load(result.normalizedBytes);
    const p = loaded.getPage(0);
    // Should be landscape A4 (841.89 x 595.28)
    expect(p.getWidth()).toBeCloseTo(PRESET_DIMENSIONS.A4.height, 1);
    expect(p.getHeight()).toBeCloseTo(PRESET_DIMENSIONS.A4.width, 1);
  });

  it('supports custom dimensions and rejects invalid custom dimensions', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([200, 200]);
    const sourceBytes = await doc.save();

    const result = await normalizePdfPageDimensions(sourceBytes, {
      preset: 'Custom',
      customDimensions: { width: 450, height: 650 },
      strategy: 'expand',
    });

    const loaded = await lib.PDFDocument.load(result.normalizedBytes);
    expect(loaded.getPage(0).getWidth()).toBe(450);
    expect(loaded.getPage(0).getHeight()).toBe(650);

    await expect(
      normalizePdfPageDimensions(sourceBytes, {
        preset: 'Custom',
        customDimensions: { width: -10, height: 100 },
        strategy: 'expand',
      }),
    ).rejects.toThrow(/requires valid positive width and height/i);
  });

  it('throws on out of bounds page index', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([200, 200]);
    const sourceBytes = await doc.save();

    await expect(
      normalizePdfPageDimensions(sourceBytes, {
        preset: 'A4',
        strategy: 'fit',
        pageIndices: [3],
      }),
    ).rejects.toThrow(/out of bounds/i);
  });
});
