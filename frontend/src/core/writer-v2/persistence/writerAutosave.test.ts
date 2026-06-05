import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '../writerV2Store';
import { createMemoryWriterPersistence } from './indexedDbWriterStore';
import {
  autosaveCurrentWriterDraft,
  discardWriterDraftForCurrentDocument,
  recoverWriterDraftForCurrentDocument,
} from './writerAutosave';

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: 'Saved text',
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
  };
}

describe('writer autosave persistence', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
    });
  });

  it('autosaves dirty Writer elements', async () => {
    const adapter = createMemoryWriterPersistence();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'UPDATE_WRITER_ELEMENT',
      id: 'writer-1',
      patch: {
        plainText: 'Changed',
      },
    });

    const result = await autosaveCurrentWriterDraft(adapter);

    expect(result.changed).toBe(true);
    expect(result.documentFingerprint).toBe('doc-1');
    expect(useWriterV2Store.getState().dirty).toBe(false);

    const saved = await adapter.loadDocument('doc-1');
    expect(saved?.elements[0].plainText).toBe('Changed');
  });

  it('recovers saved Writer elements', async () => {
    const adapter = createMemoryWriterPersistence();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    await autosaveCurrentWriterDraft(adapter, { force: true });

    useWriterV2Store.getState().clearWriterV2();

    const recovered = await recoverWriterDraftForCurrentDocument(adapter);

    expect(recovered.changed).toBe(true);
    expect(useWriterV2Store.getState().elements).toHaveLength(1);
    expect(useWriterV2Store.getState().elements[0].plainText).toBe('Saved text');
  });

  it('discards saved Writer draft', async () => {
    const adapter = createMemoryWriterPersistence();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    await autosaveCurrentWriterDraft(adapter, { force: true });

    const discarded = await discardWriterDraftForCurrentDocument(adapter);

    expect(discarded.changed).toBe(true);
    expect(await adapter.loadDocument('doc-1')).toBeNull();
  });
});
