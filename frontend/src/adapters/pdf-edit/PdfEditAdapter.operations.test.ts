import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfEditAdapter } from './PdfEditAdapter';
import type { PdfAnnotation } from '@/core/annotations/types';

// Minimal valid 1x1 transparent PNG (67 bytes)
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0x60, 0x00, 0x02, 0x00,
  0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

async function createPdf(pageSizes: Array<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of pageSizes) {
    doc.addPage([w, h]);
  }
  return new Uint8Array(await doc.save());
}

function makeAnn(id: string, type: PdfAnnotation['type'], data: Record<string, unknown> = {}): PdfAnnotation {
  return {
    id,
    type,
    pageNumber: 1,
    rect: { x: 20, y: 30, width: 80, height: 30 },
    data: { borderColor: '#f00', backgroundColor: '#ffffff', strokeWidth: 2, ...data },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('PdfEditAdapter page operations and export', () => {
  it('performs page geometry, insert, replace, extract, remove, duplicate, move, and reorder operations', async () => {
    const base = await createPdf([[300, 400], [500, 600]]);
    expect(await PdfEditAdapter.countPages(base)).toBe(2);
    expect(await PdfEditAdapter.getPageSize(base, 0)).toEqual({ width: 300, height: 400 });

    const withBlank = await PdfEditAdapter.insertBlankPage(base, 1, { width: 200, height: 200 });
    expect(await PdfEditAdapter.countPages(withBlank)).toBe(3);

    const duplicated = await PdfEditAdapter.duplicatePages(withBlank, [0]);
    expect(await PdfEditAdapter.countPages(duplicated)).toBe(4);

    const rotated = await PdfEditAdapter.rotatePage(duplicated, 0, 90);
    const rotDoc = await PDFDocument.load(rotated);
    expect(rotDoc.getPage(0).getRotation().angle).toBe(90);

    const movedSingle = await PdfEditAdapter.movePage(rotated, 0, 2);
    expect(await PdfEditAdapter.countPages(movedSingle)).toBe(4);

    const movedBlockBefore = await PdfEditAdapter.movePagesAsBlock(movedSingle, [2, 3], 0, 'before');
    expect(await PdfEditAdapter.countPages(movedBlockBefore)).toBe(4);
    const movedBlockAfter = await PdfEditAdapter.movePagesAsBlock(movedBlockBefore, [0], 3, 'after');
    expect(await PdfEditAdapter.countPages(movedBlockAfter)).toBe(4);

    const reordered = await PdfEditAdapter.reorderPages(movedBlockAfter, [3, 2, 1, 0]);
    expect(await PdfEditAdapter.countPages(reordered)).toBe(4);

    const extracted = await PdfEditAdapter.extractPages(reordered, [0, 2]);
    expect(await PdfEditAdapter.countPages(extracted)).toBe(2);

    const deleted = await PdfEditAdapter.deletePage(extracted, 1);
    expect(await PdfEditAdapter.countPages(deleted)).toBe(1);

    const donor = await createPdf([[420, 420]]);
    const inserted = await PdfEditAdapter.insertAt(deleted, donor, 1);
    expect(await PdfEditAdapter.countPages(inserted)).toBe(2);

    const replaced = await PdfEditAdapter.replacePage(inserted, 0, donor, 0);
    expect(await PdfEditAdapter.getPageSize(replaced, 0)).toEqual({ width: 420, height: 420 });

    const merged = await PdfEditAdapter.merge(replaced, [donor]);
    expect(await PdfEditAdapter.countPages(merged)).toBe(3);
  });

  it('draws text tokens, PNG images, redaction boxes, and exports annotations across types', async () => {
    const base = await createPdf([[600, 800]]);

    const withLeftText = await PdfEditAdapter.drawTextOnPages(base, {
      pages: [0],
      text: 'Page {page} of {pages} ({file})',
      x: 24,
      y: 740,
      fontSize: 12,
      color: '#123',
      opacity: 0.9,
      align: 'left',
      fileName: 'sample.pdf',
      now: new Date('2026-01-01T00:00:00Z'),
      enablePageNumberToken: true,
      enableFileNameToken: true,
      enableDateToken: false,
    });
    const withCenterRight = await PdfEditAdapter.drawTextOnPages(withLeftText, {
      pages: [0],
      text: 'Center Title',
      x: 20,
      y: 700,
      fontSize: 10,
      color: '#112233',
      opacity: 1,
      align: 'center',
      rotation: 0,
      fileName: 'sample.pdf',
      now: new Date('2026-01-01T00:00:00Z'),
      enablePageNumberToken: false,
      enableFileNameToken: false,
      enableDateToken: false,
    });
    const withRight = await PdfEditAdapter.drawTextOnPages(withCenterRight, {
      pages: [0],
      text: 'Right Note',
      x: 20,
      y: 680,
      fontSize: 10,
      color: '#000000',
      opacity: 1,
      align: 'right',
      fileName: 'sample.pdf',
      now: new Date('2026-01-01T00:00:00Z'),
      enablePageNumberToken: false,
      enableFileNameToken: false,
      enableDateToken: false,
    });

    const withImage = await PdfEditAdapter.insertImage(withRight, {
      pages: [0],
      imageBytes: TINY_PNG,
      mimeType: 'image/png',
      x: 40,
      y: 40,
      width: 24,
      height: 24,
    });
    const withRedaction = await PdfEditAdapter.drawRedactionBoxes(withImage, {
      pages: [0],
      x: 100,
      y: 100,
      width: 60,
      height: 20,
      fillColor: '#000000',
    });

    const annotations: PdfAnnotation[] = [
      makeAnn('h', 'highlight'),
      makeAnn('r', 'shape-rect'),
      makeAnn('e', 'shape-ellipse'),
      makeAnn('red', 'redaction'),
      makeAnn('ink', 'ink', { paths: [[5, 5, 25, 15]] }),
      makeAnn('cloud', 'shape-cloud'),
      makeAnn('poly', 'shape-polygon'),
      makeAnn('line', 'line', { lineStartCap: 'circle', lineEndCap: 'square', points: [0, 5, 60, 5] }),
      makeAnn('arr', 'arrow', { points: [0, 10, 60, 10] }),
      makeAnn('cal', 'callout', {
        anchor: { x: 10, y: 10 },
        knee: { x: 15, y: 20 },
        leaderStyle: 'elbow',
        arrowHead: 'filled',
        text: 'Callout label',
      }),
      makeAnn('sn1', 'sticky-note', { isCollapsed: true }),
      makeAnn('sn2', 'sticky-note', { isCollapsed: false, content: 'Note body' }),
      makeAnn('st', 'stamp'),
      makeAnn('tb', 'textbox', { text: 'Box text', rotation: 0 }),
      { ...makeAnn('skip', 'highlight'), pageNumber: 99 },
    ];

    const exported = await PdfEditAdapter.exportWithAnnotations(withRedaction, annotations);
    expect(await PdfEditAdapter.countPages(exported)).toBe(1);
    expect(exported.byteLength).toBeGreaterThan(base.byteLength);
  });
});
