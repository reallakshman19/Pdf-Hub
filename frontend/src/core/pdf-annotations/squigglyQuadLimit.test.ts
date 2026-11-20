import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { axisAlignedTextMarkupQuads } from '@/components/annotations/shared/textMarkupQuads';
import { MAX_PREVIEW_MARKUP_QUADS, squiggleSegmentBudget, squiggleWave } from '@/core/annotations/squigglyGeometry';
import type { PdfAnnotation } from '@/core/annotations/types';
import { attachNativeMarkupAppearance } from './nativeMarkupAppearance';

const annotation: PdfAnnotation = { id: 'synthetic', type: 'squiggly', pageNumber: 1,
  rect: { x: 0, y: 0, width: 100, height: 100 }, data: {}, createdAt: 1, updatedAt: 1 };
const color = { r: 1, g: 0, b: 0 };

describe('generated squiggle quad bounds', () => {
  it('chooses the same waveform at a translated floating-point segment boundary', () => {
    const translated = (123.456 + 92) - 123.456;
    expect(squiggleWave(translated, 20, 256)).toEqual(squiggleWave(92, 20, 256));
    expect(squiggleWave(92 + 0.000001, 20, 256)).toHaveLength(24);
    expect(squiggleWave(92 + 0.00001, 20, 256)).toHaveLength(25);
    expect(squiggleWave(92 - 0.00001, 20, 256)).toHaveLength(24);
  });
  it.each([16, 17, 256])('previews and generates all %i quads within the segment budget', async (count) => {
    const normalized = Array.from({ length: count }, () => [0, 0, 1, 0, 0, 1, 1, 1]).flat();
    expect(axisAlignedTextMarkupQuads(normalized, 100, 100)).toHaveLength(count);
    expect(squiggleSegmentBudget(count) * count).toBeLessThanOrEqual(4096);
    const doc = await lib.PDFDocument.create();
    const root = doc.context.obj({});
    const native = Array.from({ length: count }, () => [0, 100, 100, 100, 0, 0, 100, 0]).flat();
    expect(() => attachNativeMarkupAppearance(doc, root, annotation, [0, 0, 100, 100], native, color, 1, 1, lib)).not.toThrow();
    expect(root.has(lib.PDFName.of('AP'))).toBe(true);
  });

  it('rejects generating more quads than the preview can represent', async () => {
    const count = MAX_PREVIEW_MARKUP_QUADS + 1;
    const normalized = Array.from({ length: count }, () => [0, 0, 1, 0, 0, 1, 1, 1]).flat();
    expect(axisAlignedTextMarkupQuads(normalized, 100, 100)).toBeNull();
    const doc = await lib.PDFDocument.create();
    const root = doc.context.obj({});
    expect(() => attachNativeMarkupAppearance(doc, root, annotation, [0, 0, 100, 100], normalized, color, 1, 1, lib))
      .toThrow('more than 256 text regions');
    expect(root.has(lib.PDFName.of('AP'))).toBe(false);
  });

  it('does not replace an existing appearance above the generation limit', async () => {
    const doc = await lib.PDFDocument.create();
    const root = doc.context.obj({ AP: { N: 'existing appearance' } });
    const existing = root.get(lib.PDFName.of('AP'));
    const quads = Array((MAX_PREVIEW_MARKUP_QUADS + 1) * 8).fill(0);
    attachNativeMarkupAppearance(doc, root, annotation, [0, 0, 100, 100], quads, color, 1, 1, lib);
    expect(root.get(lib.PDFName.of('AP'))).toBe(existing);
  });
});
