import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import { exportCurrentWriterPdf } from './exportCurrentWriterPdf';

async function blankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 220,
      height: 72,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Current store export',
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
  };
}

describe('exportCurrentWriterPdf', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('exports active writer store into a valid PDF', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    const bytes = await exportCurrentWriterPdf({
      pdfBytes: await blankPdfBytes(),
    });

    expect(bytes.length).toBeGreaterThan(0);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('defaults to the main-thread path when Worker is unavailable (this test environment)', async () => {
    expect(typeof Worker).toBe('undefined');

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    // No useWorker/workerClient override — exercises the real auto-detect default.
    const bytes = await exportCurrentWriterPdf({
      pdfBytes: await blankPdfBytes(),
    });

    expect(bytes.length).toBeGreaterThan(0);
  });

  it('delegates to an injected worker client when useWorker is true', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    const flattenPdf = async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 1,
      flattenedElementCount: 1,
      embeddedAssetCount: 0,
    });

    let calledWithElements = 0;
    const bytes = await exportCurrentWriterPdf({
      pdfBytes: await blankPdfBytes(),
      useWorker: true,
      workerClient: {
        flattenPdf: async (payload) => {
          calledWithElements = payload.elements.length;
          return flattenPdf();
        },
      },
    });

    expect(calledWithElements).toBe(1);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
