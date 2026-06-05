import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { runWriterExportPreflight } from './writerExportPreflight';

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
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
    plainText: 'Text',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
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

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([300, 400]);
  return pdf.save();
}

describe('writerExportPreflight', () => {
  it('passes with visible text object', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [element('writer-1')],
      assets: [],
    });

    expect(result.ok).toBe(true);
    expect(result.visibleElementCount).toBe(1);
    expect(result.hasErrors).toBe(false);
  });

  it('blocks missing image assets', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [
        element('image-1', {
          type: 'imageBox',
          imageAssetId: 'missing-asset',
          assetIds: ['missing-asset'],
        }),
      ],
      assets: [],
    });

    expect(result.hasErrors).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('MISSING_IMAGE_ASSET');
  });

  it('passes image object with asset', async () => {
    const asset: WriterAssetRecordV2 = {
      id: 'asset-1',
      documentFingerprint: 'doc-1',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AA==',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [
        element('image-1', {
          type: 'imageBox',
          imageAssetId: 'asset-1',
          assetIds: ['asset-1'],
        }),
      ],
      assets: [asset],
    });

    expect(result.hasErrors).toBe(false);
  });

  it('flags table shape mismatch', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [
        element('table-1', {
          type: 'tableBox',
          tableData: {
            columns: [
              { id: 'col-1', label: 'A' },
              { id: 'col-2', label: 'B' },
            ],
            rows: [
              {
                id: 'row-1',
                cells: [
                  { id: 'cell-1', text: 'A1' },
                ],
              },
            ],
          },
        }),
      ],
      assets: [],
    });

    expect(result.hasErrors).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('TABLE_SHAPE_MISMATCH');
  });

  it('warns when objects are outside page bounds', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [
        element('writer-1', {
          rect: {
            x: 250,
            y: 360,
            width: 100,
            height: 80,
          },
        }),
      ],
      assets: [],
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('OBJECT_OUTSIDE_PAGE_BOUNDS');
  });

  it('warns when all objects are hidden', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 2,
      elements: [
        element('writer-1', {
          hidden: true,
        }),
      ],
      assets: [],
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.visibleElementCount).toBe(0);
    expect(result.issues.map((issue) => issue.code)).toContain('NO_VISIBLE_WRITER_OBJECTS');
  });
});
