import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import { useSessionStore } from '../../session/store';
import {
  createMemoryWriterPersistence,
  type WriterAssetRecordV2,
} from './indexedDbWriterStore';
import {
  createWriterPersistenceController,
  loadWriterSessionFromPersistence,
  saveWriterSessionToPersistence,
} from './writerPersistenceController';

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
      width: 140,
      height: 60,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Persist me',
    assetIds: [],
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

function imageAsset(
  id: string,
  documentFingerprint = 'doc-1',
): WriterAssetRecordV2 {
  return {
    id,
    documentFingerprint,
    kind: 'image',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,AA==',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('writer-v2 persistence controller', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
  });

  it('loads empty session when no stored document exists', async () => {
    const adapter = createMemoryWriterPersistence();

    const result = await loadWriterSessionFromPersistence('doc-1', adapter);

    expect(result.loaded).toBe(false);
    expect(result.elements).toEqual([]);
    expect(result.assetRecords).toEqual([]);

    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('doc-1');
    expect(useWriterV2Store.getState().elements).toEqual([]);
    expect(useWriterV2Store.getState().dirty).toBe(false);
  });

  it('saves active writer state and reloads it into the store', async () => {
    const adapter = createMemoryWriterPersistence();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('writer-1', {
          assetIds: ['asset-1'],
        }),
      ],
      assetRecords: [imageAsset('asset-1')],
    });

    const saveResult = await saveWriterSessionToPersistence(
      'doc-1',
      adapter,
      useWriterV2Store.getState(),
      '2026-01-02T00:00:00.000Z',
    );

    expect(saveResult.elementCount).toBe(1);
    expect(saveResult.assetCount).toBe(1);
    expect(useWriterV2Store.getState().dirty).toBe(false);
    expect(useWriterV2Store.getState().lastPersistedAt).toBe('2026-01-02T00:00:00.000Z');

    useWriterV2Store.getState().clearWriterV2();

    const loadResult = await loadWriterSessionFromPersistence('doc-1', adapter);

    expect(loadResult.loaded).toBe(true);
    expect(loadResult.elements).toHaveLength(1);
    expect(loadResult.assetRecords).toHaveLength(1);

    expect(useWriterV2Store.getState().elements[0].id).toBe('writer-1');
    expect(useWriterV2Store.getState().elements[0].assetIds).toEqual(['asset-1']);
    expect(useWriterV2Store.getState().assetRecords[0].id).toBe('asset-1');
  });

  it('rewrites element and asset document fingerprints during save', async () => {
    const adapter = createMemoryWriterPersistence();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'wrong-doc',
      elements: [
        element('writer-1', {
          documentFingerprint: 'wrong-doc',
        }),
      ],
      assetRecords: [
        imageAsset('asset-1', 'wrong-doc'),
      ],
    });

    await saveWriterSessionToPersistence(
      'doc-2',
      adapter,
      useWriterV2Store.getState(),
      '2026-01-03T00:00:00.000Z',
    );

    const loaded = await adapter.loadDocument('doc-2');
    const assets = await adapter.listAssets('doc-2');

    expect(loaded?.elements[0].documentFingerprint).toBe('doc-2');
    expect(assets[0].documentFingerprint).toBe('doc-2');
    expect(assets[0].updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('controller load/save methods operate on the active store', async () => {
    const adapter = createMemoryWriterPersistence();
    const controller = createWriterPersistenceController('doc-1', adapter);

    await controller.load();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [],
    });

    await controller.save();

    useWriterV2Store.getState().clearWriterV2();

    await controller.load();

    expect(useWriterV2Store.getState().elements[0].id).toBe('writer-1');
  });

  it('migrates persisted PDF-overlay pageIndex anchors to PageId on load', async () => {
    const adapter = createMemoryWriterPersistence();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'doc-1.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 2,
      pageGraph: {
        pages: [
          {
            pageId: 'page-a',
            documentKey: 'doc-1',
            originalPageNumber: 1,
            currentIndex: 0,
            width: 595,
            height: 842,
            rotation: 0,
          },
          {
            pageId: 'page-b',
            documentKey: 'doc-1',
            originalPageNumber: 2,
            currentIndex: 1,
            width: 595,
            height: 842,
            rotation: 0,
          },
        ],
      },
    });
    await adapter.saveDocument({
      documentFingerprint: 'doc-1',
      schemaVersion: 2,
      elements: [element('legacy-writer', { pageIndex: 1 })],
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    const result = await loadWriterSessionFromPersistence('doc-1', adapter);
    const persisted = await adapter.loadDocument('doc-1');

    expect(result.elements[0]).toMatchObject({
      pageId: 'page-b',
      pageIndex: 1,
    });
    expect(persisted?.elements[0]).toMatchObject({
      pageId: 'page-b',
      pageIndex: 1,
    });
  });

});
