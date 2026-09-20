import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import { useSessionStore } from '../session/store';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Store test',
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

function asset(id: string): WriterAssetRecordV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,AA==',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('writer-v2 zustand store persistence state', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
  });

  it('hydrates a complete writer session', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [asset('asset-1')],
      persistedAt: '2026-01-02T00:00:00.000Z',
    });

    const state = useWriterV2Store.getState();

    expect(state.currentDocumentFingerprint).toBe('doc-1');
    expect(state.elements[0].id).toBe('writer-1');
    expect(state.assetRecords[0].id).toBe('asset-1');
    expect(state.lastPersistedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(state.dirty).toBe(false);
  });

  it('adds and replaces writer assets by id', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [],
    });

    useWriterV2Store.getState().addWriterAssets([
      asset('asset-1'),
      {
        ...asset('asset-1'),
        dataUrl: 'data:image/png;base64,BB==',
      },
      asset('asset-2'),
    ]);

    const state = useWriterV2Store.getState();

    expect(state.assetRecords).toHaveLength(2);
    expect(state.assetRecords.find((item) => item.id === 'asset-1')?.dataUrl).toBe(
      'data:image/png;base64,BB==',
    );
    expect(state.dirty).toBe(true);
  });

  it('marks writer state as persisted', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'MOVE_WRITER_ELEMENT',
      id: 'writer-1',
      dx: 10,
      dy: 0,
    });

    expect(useWriterV2Store.getState().dirty).toBe(true);

    useWriterV2Store.getState().markWriterPersisted('2026-01-03T00:00:00.000Z');

    expect(useWriterV2Store.getState().dirty).toBe(false);
    expect(useWriterV2Store.getState().lastPersistedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('clears session metadata and assets', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assetRecords: [asset('asset-1')],
    });

    useWriterV2Store.getState().clearWriterV2();

    const state = useWriterV2Store.getState();

    expect(state.currentDocumentFingerprint).toBeNull();
    expect(state.elements).toEqual([]);
    expect(state.assetRecords).toEqual([]);
    expect(state.lastPersistedAt).toBeNull();
  });

  it('hydrates PDF-overlay elements with stable PageIds and retargets pageIndex edits', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'writer.pdf',
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

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-anchor')],
    });

    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      pageId: 'page-a',
      pageIndex: 0,
    });

    await useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable({
        type: 'UPDATE_WRITER_ELEMENT',
        id: 'writer-anchor',
        patch: { pageIndex: 1 },
        now: '2026-09-18T01:00:00.000Z',
      });

    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      pageId: 'page-b',
      pageIndex: 1,
    });
  });

  it('does not add PDF PageIds to blank-document elements', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'pdf-in-background',
      fileName: 'background.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'background-page',
          documentKey: 'pdf-in-background',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    const meta = useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-writer',
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: meta.documentFingerprint,
      elements: [element('blank-element')],
      documentMeta: meta,
    });

    expect(useWriterV2Store.getState().elements[0].pageId).toBeUndefined();
    expect(useWriterV2Store.getState().elements[0].pageIndex).toBe(0);
  });

});
