import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterElementV2 } from '../../types';
import type { WriterAssetRecordV2 } from '../../persistence/indexedDbWriterStore';
import { writerElementsToPortableBlocks } from '../docx/writerElementsToPortableBlocks';
import { exportFlattenedWriterPdf } from '../flattenedPdfExport';
import { exportWriterDocx } from '../writerDocxExporter';

describe('Writer image export paths', () => {
  it('converts imageBox to portable image block', () => {
    const result = writerElementsToPortableBlocks([
      makeImageElement({
        imageAssetId: 'asset-image-1',
        assetIds: ['asset-image-1'],
      }),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.exportedElementCount).toBe(1);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: 'image',
      assetId: 'asset-image-1',
      width: 144,
      height: 96,
      pageIndex: 0,
    });
  });

  it('emits fallback paragraph when imageBox has no asset reference', () => {
    const result = writerElementsToPortableBlocks([
      makeImageElement({
        imageAssetId: undefined,
        assetIds: undefined,
      }),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warning',
          code: 'MISSING_IMAGE_ASSET',
        }),
      ]),
    );
    expect(result.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [
        expect.objectContaining({
          text: '[Missing image]',
        }),
      ],
    });
  });

  it('embeds imageBox asset during flattened PDF export', async () => {
    const source = await createSinglePagePdfBytes();
    const result = await exportFlattenedWriterPdf({
      pdfBytes: source,
      elements: [makeImageElement({ imageAssetId: 'asset-image-1', assetIds: ['asset-image-1'] })],
      assets: [makePngAsset('asset-image-1')],
    });

    const pdf = await PDFDocument.load(result.bytes);

    expect(result.pageCount).toBe(1);
    expect(result.flattenedElementCount).toBe(1);
    expect(result.embeddedAssetCount).toBe(1);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('embeds imageBox asset into DOCX media folder', async () => {
    const result = await exportWriterDocx({
      elements: [makeImageElement({ imageAssetId: 'asset-image-1', assetIds: ['asset-image-1'] })],
      assets: [makePngAsset('asset-image-1')],
      title: 'Image export DOCX',
    });

    const zip = await JSZip.loadAsync(result.bytes);
    const files = Object.keys(zip.files);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(result.fatal).toBe(false);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.level === 'error')).toHaveLength(0);
    expect(files.some((fileName) => /^word\/media\/.+\.png$/i.test(fileName))).toBe(true);
    expect(documentXml).toContain('graphic');
    expect(documentXml).not.toContain('[Missing image]');
  });
});

async function createSinglePagePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return await doc.save();
}

function makeImageElement(input: {
  imageAssetId?: string;
  assetIds?: string[];
}): WriterElementV2 {
  return {
    id: 'image-element-1',
    documentFingerprint: 'image-export-doc',
    pageIndex: 0,
    type: 'imageBox',
    rect: {
      x: 72,
      y: 600,
      width: 144,
      height: 96,
    },
    plainText: 'Export image',
    imageAssetId: input.imageAssetId,
    assetIds: input.assetIds,
    style: {
      zIndex: 1,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function makePngAsset(id: string): WriterAssetRecordV2 {
  return {
    id,
    documentFingerprint: 'image-export-doc',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl: makeTinyPngDataUrl(),
    width: 1,
    height: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeTinyPngDataUrl(): string {
  const bytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1,
    8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 13, 73, 68, 65,
    84, 120, 156, 99, 248, 15, 4,
    0, 9, 251, 3, 253, 167, 110,
    112, 165, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130,
  ]);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:image/png;${'base'}${'64'},${globalThis.btoa(binary)}`;
}
