import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnotationStore } from '../../annotations/store';
import {
  materializePdfCommand,
  type PdfCommand,
} from '../../commands/types';
import { useSessionStore } from '../../session/store';
import { useHistoryStore } from '../store';
import { applyRedo, applyUndo } from '../transactions';
import type { HistoryState } from '../types';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('../../annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

function command(): PdfCommand {
  return materializePdfCommand(
    {
      type: 'ROTATE_PAGES',
      payload: {
        pageIndices: [0],
        angle: 90,
      },
    },
    'toolbar',
    'test',
    {
      id: 'rotate-1',
      createdAt: '2026-09-18T00:00:00.000Z',
    },
  );
}

function historyState(
  bytes: Uint8Array,
  documentKey: string,
  pageCount = 1,
): HistoryState {
  return {
    bytes,
    pageCount,
    pageGraph: {
      pages: Array.from({ length: pageCount }, (_, index) => ({
        pageId: `${documentKey}::stable::${index + 1}`,
        documentKey,
        originalPageNumber: index + 1,
        currentIndex: index,
        width: 595,
        height: 842,
        rotation: 0 as const,
      })),
    },
    documentKey,
    selectedPages: [1],
    currentPage: 1,
    annotations: [],
  };
}

describe('Document History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
  });

  it('pushes, undoes, and redoes canonical transactions in the store', () => {
    const store = useHistoryStore.getState();

    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    store.push({
      id: '1',
      command: command(),
      label: 'Rotate page',
      timestamp: 0,
      before: historyState(new Uint8Array([0]), 'before'),
      after: historyState(new Uint8Array([1]), 'after'),
    });

    expect(useHistoryStore.getState().canUndo()).toBe(true);

    const undoTx = store.undo();
    expect(undoTx?.id).toBe('1');
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().canRedo()).toBe(true);

    const redoTx = store.redo();
    expect(redoTx?.id).toBe('1');
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('applies undo and redo to session and annotation state', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'after',
      fileName: 'test.pdf',
      bytes: new Uint8Array([4, 5, 6]),
      pageCount: 1,
    });

    useHistoryStore.getState().push({
      id: '2',
      command: command(),
      label: 'Rotate page',
      timestamp: 0,
      before: historyState(new Uint8Array([1, 2, 3]), 'before'),
      after: historyState(new Uint8Array([4, 5, 6]), 'after'),
    });

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(useSessionStore.getState().documentKey).toBe('before');
    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'before::stable::1',
      documentKey: 'before',
    });
    expect(persistenceMocks.saveAnnotations).toHaveBeenCalledWith('before', []);

    await expect(applyRedo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([4, 5, 6]),
    );
    expect(useSessionStore.getState().documentKey).toBe('after');
    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'after::stable::1',
      documentKey: 'after',
    });
    expect(persistenceMocks.saveAnnotations).toHaveBeenCalledWith('after', []);
  });

  it('does not move the history stack when target persistence fails', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'after',
      fileName: 'test.pdf',
      bytes: new Uint8Array([4]),
      pageCount: 1,
    });

    useHistoryStore.getState().push({
      id: 'persist-failure',
      command: command(),
      label: 'Rotate page',
      timestamp: 0,
      before: historyState(new Uint8Array([1]), 'before'),
      after: historyState(new Uint8Array([4]), 'after'),
    });

    persistenceMocks.saveAnnotations.mockRejectedValueOnce(
      new Error('IndexedDB unavailable'),
    );

    await expect(applyUndo()).rejects.toThrow('IndexedDB unavailable');
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
    expect(useSessionStore.getState().documentKey).toBe('after');
  });

  it('returns false when undo and redo stacks are empty', async () => {
    await expect(applyUndo()).resolves.toBe(false);
    await expect(applyRedo()).resolves.toBe(false);
  });

  it('supports peek helpers for undo and redo stacks', () => {
    useHistoryStore.getState().push({
      id: 'peek-1',
      command: command(),
      label: 'Rotate page',
      timestamp: 0,
      before: historyState(new Uint8Array([1]), 'before'),
      after: historyState(new Uint8Array([2]), 'after'),
    });

    expect(useHistoryStore.getState().peekUndo()?.id).toBe('peek-1');
    expect(useHistoryStore.getState().peekRedo()).toBeNull();
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().peekRedo()?.id).toBe('peek-1');
  });
});
