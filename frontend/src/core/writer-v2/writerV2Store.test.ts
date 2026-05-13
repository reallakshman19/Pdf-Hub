import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
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
});
