import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useWriterV2Store } from '../writerV2Store';
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

  it('throws when document fingerprint is missing', async () => {
    await expect(
      exportCurrentWriterProject({
        originalPdfBytes: await blankPdfBytes(),
      }),
    ).rejects.toThrow(/documentFingerprint/);
  });
});
