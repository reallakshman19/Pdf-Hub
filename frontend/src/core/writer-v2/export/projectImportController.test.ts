import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { exportPdfHubWriterProject } from './projectZip';
import { importProjectIntoWriterStore } from './projectImportController';

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
    plainText: 'Restored editable text',
    assetIds: ['asset-1'],
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

function asset(): WriterAssetRecordV2 {
  return {
    id: 'asset-1',
    documentFingerprint: 'doc-1',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('project import controller', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('imports project and hydrates writer store for fresh-browser editability', async () => {
    const project = await exportPdfHubWriterProject({
      originalPdfBytes: await blankPdfBytes(),
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assets: [asset()],
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const session = await importProjectIntoWriterStore(project.bytes);

    expect(session.documentFingerprint).toBe('doc-1');
    expect(session.elementCount).toBe(1);
    expect(session.assetCount).toBe(1);

    const state = useWriterV2Store.getState();

    expect(state.currentDocumentFingerprint).toBe('doc-1');
    expect(state.elements[0].id).toBe('writer-1');
    expect(state.elements[0].plainText).toBe('Restored editable text');
    expect(state.elements[0].assetIds).toEqual(['asset-1']);
    expect(state.assetRecords[0].id).toBe('asset-1');
    expect(state.dirty).toBe(false);

    const pdf = await PDFDocument.load(session.originalPdfBytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
