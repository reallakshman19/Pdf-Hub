import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';

async function blankPdfBytes(pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([612, 792]);
  }

  return doc.save();
}

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 240,
      height: 80,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Flattened writer text',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

function pngAsset(id: string): WriterAssetRecordV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('flattened writer PDF export', () => {
  it('exports a valid PDF and preserves page count', async () => {
    const result = await exportFlattenedWriterPdf({
      pdfBytes: await blankPdfBytes(2),
      elements: [
        element('writer-1'),
        element('writer-2', {
          pageIndex: 1,
          plainText: 'Second page',
        }),
      ],
    });

    expect(result.pageCount).toBe(2);
    expect(result.flattenedElementCount).toBe(2);
    expect(result.bytes.length).toBeGreaterThan(0);

    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('skips hidden elements', async () => {
    const result = await exportFlattenedWriterPdf({
      pdfBytes: await blankPdfBytes(1),
      elements: [
        element('visible'),
        element('hidden', {
          hidden: true,
        }),
      ],
    });

    expect(result.flattenedElementCount).toBe(1);
  });

  it('draws text callout leader without failing', async () => {
    const result = await exportFlattenedWriterPdf({
      pdfBytes: await blankPdfBytes(1),
      elements: [
        element('callout-1', {
          type: 'textCallout',
          plainText: 'Callout note',
          callout: {
            anchorPoint: {
              x: 60,
              y: 700,
            },
            leaderStyle: 'arrow',
            leaderColor: '#475569',
            leaderWidth: 1.5,
          },
        }),
      ],
    });

    expect(result.flattenedElementCount).toBe(1);

    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('embeds image assets referenced by writer element', async () => {
    const result = await exportFlattenedWriterPdf({
      pdfBytes: await blankPdfBytes(1),
      elements: [
        element('writer-image', {
          assetIds: ['asset-1'],
          plainText: 'With image',
        }),
      ],
      assets: [pngAsset('asset-1')],
    });

    expect(result.embeddedAssetCount).toBe(1);
    expect(result.flattenedElementCount).toBe(1);

    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('ignores elements pointing to pages outside the source PDF', async () => {
    const result = await exportFlattenedWriterPdf({
      pdfBytes: await blankPdfBytes(1),
      elements: [
        element('off-page', {
          pageIndex: 10,
        }),
      ],
    });

    expect(result.pageCount).toBe(1);
    expect(result.flattenedElementCount).toBe(1);
    expect(result.bytes.length).toBeGreaterThan(0);
  });
});
