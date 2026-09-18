import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import {
  materializePdfCommand,
  type PdfCommand,
} from '@/core/commands/types';
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
    hashBytes: vi.fn().mockImplementation(
      async (bytes: Uint8Array) => `hash-${bytes[0] ?? 0}`,
    ),
  },
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    countPages: vi.fn().mockResolvedValue(1),
  },
}));

function command(documentKey: string, id: string): PdfCommand {
  return materializePdfCommand(
    {
      type: 'ROTATE_PAGES',
      payload: {
        pageIndices: [0],
        angle: 90,
      },
    },
    'toolbar',
    documentKey,
    {
      id,
      createdAt: '2026-09-18T00:00:00.000Z',
    },
  );
}

const beforeAnnotation: PdfAnnotation = {
  id: 'annotation-before',
  type: 'highlight',
  pageNumber: 1,
  rect: { x: 10, y: 10, width: 20, height: 10 },
  data: {},
  createdAt: 1,
  updatedAt: 1,
};

const afterAnnotation: PdfAnnotation = {
  ...beforeAnnotation,
  id: 'annotation-after',
  rect: { x: 20, y: 20, width: 20, height: 10 },
  updatedAt: 2,
};

describe('document transaction history memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([beforeAnnotation]);
    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });
  });

  it('shares adjacent byte snapshots and restores dependent state through undo and redo', async () => {
    await commitDocumentMutation({
      command: command('hash-1', 'rotate-1'),
      label: 'First rotation',
      beforeBytes: new Uint8Array([1]),
      afterBytes: new Uint8Array([2]),
      nextAnnotations: [afterAnnotation],
      nextSelectedPages: [1],
      nextCurrentPage: 1,
    });

    const secondBefore = useSessionStore.getState().workingBytes;
    expect(secondBefore).not.toBeNull();

    await commitDocumentMutation({
      command: command('hash-2', 'rotate-2'),
      label: 'Second rotation',
      beforeBytes: secondBefore ?? new Uint8Array(),
      afterBytes: new Uint8Array([3]),
      nextAnnotations: [afterAnnotation],
    });

    const history = useHistoryStore.getState();
    expect(history.undoStack).toHaveLength(2);
    expect(history.undoStack[1]?.before.bytes).toBe(
      history.undoStack[0]?.after.bytes,
    );
    expect(history.undoStack[0]?.command.source).toBe('toolbar');
    expect(history.undoStack[0]?.before.annotations).toEqual([beforeAnnotation]);
    expect(history.undoStack[0]?.after.annotations).toEqual([afterAnnotation]);
    expect(history.getDiagnostics()).toMatchObject({
      retainedTransactions: 2,
      retainedBytes: 3,
      droppedTransactions: 0,
      overBudget: false,
    });

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2]));
    expect(useSessionStore.getState().documentKey).toBe('hash-2');
    expect(useAnnotationStore.getState().annotations).toEqual([afterAnnotation]);

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1]));
    expect(useSessionStore.getState().documentKey).toBe('hash-1');
    expect(useAnnotationStore.getState().annotations).toEqual([beforeAnnotation]);

    await expect(applyRedo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2]));
    expect(useSessionStore.getState().documentKey).toBe('hash-2');
    expect(useAnnotationStore.getState().annotations).toEqual([afterAnnotation]);
  });
});
