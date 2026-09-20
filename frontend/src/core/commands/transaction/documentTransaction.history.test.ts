import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnotationStore } from '@/core/annotations/store';
import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import type { PdfAnnotation } from '@/core/annotations/types';
import {
  materializePdfCommand,
  type PdfCommand,
} from '@/core/commands/types';
import { useHistoryStore } from '@/core/document-history/store';
import {
  createInitialHistoryJournalManifest,
} from '@/core/document-history/journal/types';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { useSessionStore } from '@/core/session/store';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  commitDocumentMutation,
} from './documentTransaction';

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

const pdfMocks = vi.hoisted(() => ({
  countPages: vi.fn().mockResolvedValue(1),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    countPages: pdfMocks.countPages,
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

function checkpointBarrierCommand(
  documentKey: string,
  id: string,
): PdfCommand {
  return materializePdfCommand(
    {
      type: 'REPLACE_PAGE',
      payload: {
        atIndex: 0,
        donorResourceId: 'donor-a',
        donorPageIndex: 0,
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
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
    useAnnotationStore.getState().setAnnotations([beforeAnnotation]);
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'hash-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'hash-1',
      result: {
        documentFingerprint: 'hash-1',
        createdAt: '2026-09-18T00:00:00.000Z',
        engineId: 'test',
        profileId: 'clean-scan',
        pages: [{
          status: 'success',
          pageIndex: 0,
          pageNumber: 1,
          width: 595,
          height: 842,
          words: [{
            id: 'word-1',
            pageIndex: 0,
            text: 'OCR',
            normalizedText: 'ocr',
            confidence: 0.9,
            bbox: { x: 100, y: 100, width: 40, height: 20 },
          }],
          lines: [],
          blocks: [],
          diagnostics: [],
        }],
        diagnostics: [],
      },
      selectedPageIndexes: [0],
    });
  });

  it('publishes a revision before commit and restores revision identity through undo/redo', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'transaction-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'initial',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);
    const journalStore = new MemoryHistoryJournalStore({
      id: 'transaction-history-journal',
    });
    registerHistoryJournalStore(journalStore);
    await journalStore.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-transaction',
        revisionStoreId: revisionStore.id,
        revisionId: 'hash-1',
        fileName: 'fixture.pdf',
        createdAt: '2026-09-18T00:00:00.000Z',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-transaction',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'hash-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    const result = await commitDocumentMutation({
      command: command('hash-1', 'revision-rotate'),
      label: 'Revision-aware rotation',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    expect(result).toMatchObject({
      nextDocumentKey: 'hash-2',
      activeRevisionId: 'hash-2',
    });
    expect(await revisionStore.has('hash-2')).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-2',
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-2',
    });

    const transaction =
      useHistoryStore.getState().undoStack.at(-1);
    expect(transaction?.before).toMatchObject({
      activeRevisionId: 'hash-1',
      revision: {
        storeId: revisionStore.id,
        revisionId: 'hash-1',
      },
    });
    expect(transaction?.after).toMatchObject({
      activeRevisionId: 'hash-2',
      revision: {
        storeId: revisionStore.id,
        revisionId: 'hash-2',
      },
    });
    expect(transaction?.before.bytes).toBeUndefined();
    expect(transaction?.after.bytes).toBeUndefined();
    expect(useHistoryStore.getState().getDiagnostics()).toMatchObject({
      retainedBytes: 0,
      overBudget: false,
    });
    const durableAfterMutation = await journalStore.load(
      'history-transaction',
    );
    expect(durableAfterMutation).toMatchObject({
      activeRevisionId: 'hash-2',
      entries: [{
        transactionId: transaction?.id,
        disposition: 'SELF_CONTAINED_REPLAY',
        beforeRevision: {
          revisionId: 'hash-1',
        },
        afterRevision: {
          revisionId: 'hash-2',
        },
      }],
      checkpoints: [
        { kind: 'ADMISSION' },
        {
          kind: 'PERIODIC',
          transactionId:
            transaction?.id,
          revision: {
            revisionId: 'hash-2',
          },
          statePayload: {
            schemaVersion: 2,
            documentKey: 'hash-2',
            pageGraph: {
              pages: [{
                pageId: 'stable-page',
                documentKey: 'hash-2',
              }],
            },
            ocr: {
              documentFingerprint:
                'hash-2',
            },
          },
        },
      ],
    });

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-1',
      activeRevisionId: 'hash-1',
    });
    await expect(
      journalStore.load('history-transaction'),
    ).resolves.toMatchObject({
      activeRevisionId: 'hash-1',
      entries: [{ transactionId: transaction?.id }],
    });

    await expect(applyRedo()).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-2',
      activeRevisionId: 'hash-2',
    });
    await expect(
      journalStore.load('history-transaction'),
    ).resolves.toMatchObject({
      activeRevisionId: 'hash-2',
      entries: [{ transactionId: transaction?.id }],
    });
  });

  it('recovery replay mutates the active revision without duplicating history, journal, or annotation persistence', async () => {
    const revisionStore =
      new MemoryRevisionStore({
        id: 'recovery-replay-revisions',
      });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'recovery-replay-before',
        bytes: Uint8Array.from([1]),
      }),
    });
    await revisionStore.commit({
      revisionId: 'hash-2',
      source: new MemorySource({
        id: 'recovery-replay-after',
        bytes: Uint8Array.from([2]),
      }),
    });
    registerWorkingRevisionStore(
      revisionStore,
    );

    const journalStore =
      new MemoryHistoryJournalStore({
        id: 'recovery-replay-journal',
      });
    registerHistoryJournalStore(
      journalStore,
    );
    await journalStore.save(
      createInitialHistoryJournalManifest({
        journalId:
          'history-recovery-replay',
        revisionStoreId:
          revisionStore.id,
        revisionId: 'hash-1',
        fileName: 'fixture.pdf',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId:
        revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      historyJournalStoreId:
        journalStore.id,
      historyJournalId:
        'history-recovery-replay',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'hash-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    const result =
      await commitDocumentMutation({
        command: command(
          'hash-1',
          'recovery-replay-rotate',
        ),
        label: 'Recovery replay rotation',
        beforeBytes:
          Uint8Array.from([1]),
        afterBytes:
          Uint8Array.from([2]),
        revisionMetadata: {
          beforePageCount: 1,
          afterPageCount: 1,
        },
        executionMode:
          'recovery-replay',
        recoveryRevision: {
          revisionId: 'hash-2',
          bytes: Uint8Array.from([2]),
        },
      });

    expect(result).toMatchObject({
      nextDocumentKey: 'hash-2',
      activeRevisionId: 'hash-2',
    });
    expect(
      useSessionStore.getState(),
    ).toMatchObject({
      documentKey: 'hash-2',
      activeRevisionId: 'hash-2',
    });
    expect(
      useHistoryStore.getState().undoStack,
    ).toEqual([]);
    expect(
      useHistoryStore.getState().redoStack,
    ).toEqual([]);
    expect(
      persistenceMocks.saveAnnotations,
    ).not.toHaveBeenCalled();
    await expect(
      journalStore.load(
        'history-recovery-replay',
      ),
    ).resolves.toMatchObject({
      activeRevisionId: 'hash-1',
      activeTransactionId: null,
      entries: [],
    });
  });

  it('rejects recovery replay when authoritative revision bytes are missing', async () => {
    const revisionStore =
      new MemoryRevisionStore({
        id: 'missing-authority-revisions',
      });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'missing-authority-before',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(
      revisionStore,
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId:
        revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    await expect(
      commitDocumentMutation({
        command: command(
          'hash-1',
          'recovery-replay-missing-authority',
        ),
        label:
          'Recovery replay missing authority',
        beforeBytes:
          Uint8Array.from([1]),
        afterBytes:
          Uint8Array.from([2]),
        revisionMetadata: {
          beforePageCount: 1,
          afterPageCount: 1,
        },
        executionMode:
          'recovery-replay',
      }),
    ).rejects.toMatchObject({
      stage: 'prepare',
    });

    expect(
      useSessionStore.getState(),
    ).toMatchObject({
      documentKey: 'hash-1',
      activeRevisionId: 'hash-1',
      workingBytes: Uint8Array.from([1]),
    });
    expect(
      useHistoryStore.getState().undoStack,
    ).toEqual([]);
    expect(
      persistenceMocks.saveAnnotations,
    ).not.toHaveBeenCalled();
  });

  it('attaches recovery-complete after-state to a binary checkpoint barrier before journal save', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'barrier-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'barrier-initial',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);

    const journalStore = new MemoryHistoryJournalStore({
      id: 'barrier-history-journal',
    });
    registerHistoryJournalStore(journalStore);
    await journalStore.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-barrier',
        revisionStoreId: revisionStore.id,
        revisionId: 'hash-1',
        fileName: 'fixture.pdf',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-barrier',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'hash-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    await commitDocumentMutation({
      command: checkpointBarrierCommand(
        'hash-1',
        'barrier-replace',
      ),
      label: 'Replace page from donor',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      nextAnnotations: [afterAnnotation],
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    const durable = await journalStore.load(
      'history-barrier',
    );
    const checkpoint =
      durable?.checkpoints.find(
        (candidate) =>
          candidate.transactionId
          === useHistoryStore.getState().peekUndo()?.id,
      );

    expect(checkpoint).toMatchObject({
      kind: 'BARRIER',
      revision: {
        storeId: revisionStore.id,
        revisionId: 'hash-2',
      },
      statePayload: {
        schemaVersion: 2,
        pageCount: 1,
        documentKey: 'hash-2',
        pageGraph: {
          pages: [{
            pageId: 'stable-page',
            documentKey: 'hash-2',
          }],
        },
        annotations: [{
          id: 'annotation-after',
        }],
        writer: {
          elements: [],
          selectedIds: [],
          activeId: null,
        },
        ocr: {
          documentFingerprint: 'hash-2',
          selectedPageIndexes: [0],
        },
      },
    });
    expect(
      JSON.stringify(checkpoint?.statePayload),
    ).not.toContain('"revision"');
    expect(
      JSON.stringify(checkpoint?.statePayload),
    ).not.toContain('"bytes"');
  });

  it('rolls undo state and stacks back when journal navigation save fails', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'undo-journal-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'undo-journal-initial',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);

    const journalStore = new MemoryHistoryJournalStore({
      id: 'undo-journal-store',
    });
    registerHistoryJournalStore(journalStore);
    await journalStore.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-undo',
        revisionStoreId: revisionStore.id,
        revisionId: 'hash-1',
        fileName: 'fixture.pdf',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-undo',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    await commitDocumentMutation({
      command: command('hash-1', 'undo-journal-mutation'),
      label: 'Undo journal mutation',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    vi.spyOn(journalStore, 'save').mockRejectedValueOnce(
      new Error('journal navigation unavailable'),
    );

    await expect(applyUndo()).rejects.toThrow(
      /journal navigation unavailable/,
    );

    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-2',
      activeRevisionId: 'hash-2',
      workingBytes: Uint8Array.from([2]),
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    await expect(
      journalStore.load('history-undo'),
    ).resolves.toMatchObject({
      activeRevisionId: 'hash-2',
      entries: [{ transactionId: expect.any(String) }],
    });
  });

  it('rolls application history back when durable journal save fails', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'journal-failure-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'journal-failure-initial',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);

    const journalStore = new MemoryHistoryJournalStore({
      id: 'journal-failure-store',
    });
    registerHistoryJournalStore(journalStore);
    await journalStore.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-failure',
        revisionStoreId: revisionStore.id,
        revisionId: 'hash-1',
        fileName: 'fixture.pdf',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-failure',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    vi.spyOn(journalStore, 'save').mockRejectedValueOnce(
      new Error('journal quota exceeded'),
    );

    const failed = commitDocumentMutation({
      command: command('hash-1', 'journal-failure'),
      label: 'Journal failure',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    await expect(failed).rejects.toMatchObject({
      stage: 'persistence',
    });
    await expect(failed).rejects.toThrow(
      /history journal persistence failed/,
    );
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-1',
      activeRevisionId: 'hash-1',
      workingBytes: Uint8Array.from([1]),
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    await expect(
      journalStore.load('history-failure'),
    ).resolves.toMatchObject({
      activeRevisionId: 'hash-1',
      entries: [],
    });
  });

  it('does not consume undo history when the target revision store is unavailable', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'missing-history-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'initial-history',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    await commitDocumentMutation({
      command: command('hash-1', 'history-store-loss'),
      label: 'History store loss',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    clearWorkingRevisionStoreRegistryForTests();

    await expect(applyUndo()).rejects.toThrow(
      /not registered for history restore/,
    );
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-2',
      activeRevisionId: 'hash-2',
      workingBytes: Uint8Array.from([2]),
    });
  });

  it('aborts before annotation persistence and state commit when revision publication fails', async () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'failing-revisions',
    });
    await revisionStore.commit({
      revisionId: 'hash-1',
      source: new MemorySource({
        id: 'initial',
        bytes: Uint8Array.from([1]),
      }),
    });
    registerWorkingRevisionStore(revisionStore);

    useSessionStore.getState().openDocument({
      documentKey: 'hash-1',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'hash-1',
      activeRevisionId: 'hash-1',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    vi.spyOn(revisionStore, 'commit').mockRejectedValueOnce(
      new Error('storage full'),
    );
    persistenceMocks.saveAnnotations.mockClear();

    const failedMutation = commitDocumentMutation({
      command: command('hash-1', 'failed-publication'),
      label: 'Failed publication',
      beforeBytes: Uint8Array.from([1]),
      afterBytes: Uint8Array.from([2]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });
    await expect(failedMutation).rejects.toMatchObject({
      stage: 'persistence',
    });
    await expect(failedMutation).rejects.toThrow(
      /working revision publication failed/,
    );

    expect(
      persistenceMocks.saveAnnotations,
    ).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'hash-1',
      activeRevisionId: 'hash-1',
      workingBytes: Uint8Array.from([1]),
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(
      0,
    );
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
    expect(history.undoStack[0]?.before.ocr?.documentFingerprint).toBe('hash-1');
    expect(history.undoStack[0]?.before.ocr?.result?.pages[0]?.pageId).toBe(
      'stable-page',
    );
    expect(history.undoStack[0]?.after.ocr?.documentFingerprint).toBe('hash-2');
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
    expect(useOcrStore.getState().documentFingerprint).toBe('hash-2');
    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'stable-page',
      pageIndex: 0,
    });

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1]));
    expect(useSessionStore.getState().documentKey).toBe('hash-1');
    expect(useSessionStore.getState().pageGraph?.pages[0]?.pageId).toBe('stable-page');
    expect(useAnnotationStore.getState().annotations).toEqual([beforeAnnotation]);
    expect(useOcrStore.getState().documentFingerprint).toBe('hash-1');
    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'stable-page',
      pageIndex: 0,
    });

    await expect(applyRedo()).resolves.toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2]));
    expect(useSessionStore.getState().documentKey).toBe('hash-2');
    expect(useAnnotationStore.getState().annotations).toEqual([afterAnnotation]);
    expect(useOcrStore.getState().documentFingerprint).toBe('hash-2');
    expect(useOcrStore.getState().result?.pages[0]?.pageId).toBe('stable-page');
  });

  it('uses supplied revision metadata without reparsing PDF page counts', async () => {
    const result = await commitDocumentMutation({
      command: command('hash-1', 'metadata-rotation'),
      label: 'Metadata rotation',
      beforeBytes: new Uint8Array([1]),
      afterBytes: new Uint8Array([4]),
      revisionMetadata: {
        beforePageCount: 1,
        afterPageCount: 1,
      },
    });

    expect(result.nextPageCount).toBe(1);
    expect(pdfMocks.countPages).not.toHaveBeenCalled();
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([4]),
    );
    expect(useHistoryStore.getState().undoStack.at(-1)).toMatchObject({
      before: { pageCount: 1 },
      after: { pageCount: 1 },
    });
  });

  it('rejects stale revision metadata during prepare before persistence or store mutation', async () => {
    const beforeBytes =
      useSessionStore.getState().workingBytes;

    await expect(
      commitDocumentMutation({
        command: command('hash-1', 'stale-metadata'),
        label: 'Stale metadata',
        beforeBytes: new Uint8Array([1]),
        afterBytes: new Uint8Array([5]),
        revisionMetadata: {
          beforePageCount: 2,
          afterPageCount: 2,
        },
      }),
    ).rejects.toMatchObject({
      stage: 'prepare',
    } satisfies Partial<DocumentMutationTransactionError>);

    expect(pdfMocks.countPages).not.toHaveBeenCalled();
    expect(
      persistenceMocks.saveAnnotations,
    ).not.toHaveBeenCalled();
    expect(useSessionStore.getState().workingBytes).toBe(
      beforeBytes,
    );
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('retains parse-based page-count fallback when revision metadata is absent', async () => {
    pdfMocks.countPages
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    await commitDocumentMutation({
      command: command('hash-1', 'fallback-count'),
      label: 'Fallback count',
      beforeBytes: new Uint8Array([1]),
      afterBytes: new Uint8Array([6]),
    });

    expect(pdfMocks.countPages).toHaveBeenCalledTimes(2);
  });

});