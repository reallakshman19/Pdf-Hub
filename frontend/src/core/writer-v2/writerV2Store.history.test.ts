import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnotationStore } from '@/core/annotations/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { useSessionStore } from '@/core/session/store';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

function element(id: string, documentFingerprint = 'doc-writer'): WriterElementV2 {
  return {
    id,
    documentFingerprint,
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 50 },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Writer',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  };
}

describe('Writer V2 canonical history integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
  });

  it('records PDF-overlay mutations in global history and restores them chronologically', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-writer',
      fileName: 'writer.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-writer',
      elements: [element('writer-1')],
    });

    await useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable({
        type: 'MOVE_WRITER_ELEMENT',
        id: 'writer-1',
        dx: 25,
        dy: 0,
      });

    expect(useWriterV2Store.getState().elements[0]?.rect.x).toBe(35);
    expect(useWriterV2Store.getState().undoStack).toHaveLength(0);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]?.command.type).toBe('WRITER_CHANGE');

    await expect(applyUndo()).resolves.toBe(true);
    expect(useWriterV2Store.getState().elements[0]?.rect.x).toBe(10);

    await expect(applyRedo()).resolves.toBe(true);
    expect(useWriterV2Store.getState().elements[0]?.rect.x).toBe(35);
  });

  it('keeps local Writer history for standalone blank documents', () => {
    const meta = useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-writer',
      pageCount: 1,
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: element('blank-1', meta.documentFingerprint),
    });

    expect(useWriterV2Store.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
