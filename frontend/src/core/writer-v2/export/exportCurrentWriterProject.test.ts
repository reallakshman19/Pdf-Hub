import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useWriterV2Store } from '../writerV2Store';
import { useOcrStore } from '../../ocr/ocrStore';
import type { OcrResumeTokenV1 } from '../../ocr/ocrResumeState';
import type { WriterElementV2 } from '../types';
import {
  exportCurrentWriterProject,
} from './exportCurrentWriterProject';
import { importPdfHubWriterProject } from './projectZip';

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
      x: 10,
      y: 20,
      width: 140,
      height: 70,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Current project export',
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

describe('exportCurrentWriterProject', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useOcrStore.getState().clearOcr();
  });

  it('exports current active writer store as project ZIP', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [],
    });

    const bytes = await exportCurrentWriterProject({
      originalPdfBytes: await blankPdfBytes(),
    });

    const imported = await importPdfHubWriterProject(bytes);

    expect(imported.manifest.schema).toBe('pdf-hub-project');
    expect(imported.elements[0].plainText).toBe('Current project export');
  });

  it('round-trips a pending OCR resume checkpoint through current project export', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [],
    });

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-1',
      resumeToken: makeResumeToken('doc-1'),
    });

    const bytes = await exportCurrentWriterProject({
      originalPdfBytes: await blankPdfBytes(),
    });

    const imported = await importPdfHubWriterProject(bytes);

    expect(imported.ocrProject?.manifest.resumeToken).toMatchObject({
      schema: 'pdf-hub-ocr-resume',
      documentFingerprint: 'doc-1',
      engineId: 'mock',
      profileId: 'clean-scan',
    });
    expect(imported.ocrProject?.manifest.resumeToken?.tasks).toEqual([
      expect.objectContaining({
        pageIndexes: [0],
        status: 'failed',
      }),
    ]);
  });

  it('throws when document fingerprint is missing', async () => {
    await expect(
      exportCurrentWriterProject({
        originalPdfBytes: await blankPdfBytes(),
      }),
    ).rejects.toThrow(/documentFingerprint/);
  });

  it('defaults to the main-thread path when Worker is unavailable (this test environment)', async () => {
    expect(typeof Worker).toBe('undefined');

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [],
    });

    const bytes = await exportCurrentWriterProject({
      originalPdfBytes: await blankPdfBytes(),
    });

    expect(bytes.length).toBeGreaterThan(0);
  });

  it('delegates to an injected worker client when useWorker is true', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [],
    });

    let calledWithFingerprint = '';
    const bytes = await exportCurrentWriterProject({
      originalPdfBytes: await blankPdfBytes(),
      useWorker: true,
      workerClient: {
        packProjectZip: async (payload) => {
          calledWithFingerprint = payload.documentFingerprint;
          return {
            bytes: new Uint8Array([4, 5, 6]),
            manifest: {
              schema: 'pdf-hub-project',
              schemaVersion: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              documentFingerprint: payload.documentFingerprint,
              files: {
                writerElements: 'writer-elements.json',
                writerAssets: 'writer-assets.json',
                assetDirectory: 'assets/',
              },
              counts: { writerElements: 1, writerAssets: 0 },
            },
            elementCount: 1,
            assetCount: 0,
            ocrProjectIncluded: false,
          };
        },
      },
    });

    expect(calledWithFingerprint).toBe('doc-1');
    expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
  });
function makeResumeToken(
  documentFingerprint: string,
): OcrResumeTokenV1 {
  return {
    schema: 'pdf-hub-ocr-resume',
    schemaVersion: 1,
    documentFingerprint,
    engineId: 'mock',
    profileId: 'clean-scan',
    executionConfig: {
      forceOcr: false,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    },
    createdAt: '2026-09-23T00:00:00.000Z',
    tasks: [
      {
        id: 'ocr-batch-1',
        index: 0,
        pageIndexes: [0],
        status: 'failed',
        errorMessage: 'Interrupted OCR batch.',
      },
    ],
  };
}

});
