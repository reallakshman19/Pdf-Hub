import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationStore } from '@/core/annotations/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { useSessionStore } from '@/core/session/store';
import { commitDocumentMutation } from './documentTransaction';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    hashBytes: vi.fn().mockImplementation(async (bytes: Uint8Array) => `hash-${bytes[0] ?? 0}`),
  },
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    countPages: vi.fn().mockResolvedValue(1),
  },
}));

const command = { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 } as const;

describe('document transaction history memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });
  });

  it('shares adjacent snapshots and restores document keys through undo and redo', async () => {
    await commitDocumentMutation({
      command,
      source: 'toolbar',
      label: 'First rotation',
      beforeBytes: new Uint8Array([1]),
      afterBytes: new Uint8Array([2]),
    });

    const secondBefore = useSessionStore.getState().workingBytes;
    expect(secondBefore).not.toBeNull();

    await commitDocumentMutation({
      command,
      source: 'toolbar',
      label: 'Second rotation',
      beforeBytes: secondBefore ?? new Uint8Array(),
      afterBytes: new Uint8Array([3]),
    });

    const history = useHistoryStore.getState();
    expect(history.undoStack).toHaveLength(2);
    expect(history.undoStack[1]?.before.bytes).toBe(history.undoStack[0]?.after.bytes);
    expect(history.getDiagnostics()).toMatchObject({
      retainedTransactions: 2,
      retainedBytes: 3,
      droppedTransactions: 0,
      overBudget: false,
    });

    expect(applyUndo()).toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2]));
    expect(useSessionStore.getState().documentKey).toBe('hash-2');

    expect(applyUndo()).toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1]));
    expect(useSessionStore.getState().documentKey).toBe('hash-1');

    expect(applyRedo()).toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2]));
    expect(useSessionStore.getState().documentKey).toBe('hash-2');
  });
});
