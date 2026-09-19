import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  enqueueDocumentOperation,
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import {
  createInitialHistoryJournalManifest,
} from '@/core/document-history/journal/types';
import { useHistoryStore } from '@/core/document-history/store';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { PdfAnnotation } from './types';
import { useAnnotationStore } from './store';

function annotation(
  id: string,
  overrides: Partial<PdfAnnotation> = {},
): PdfAnnotation {
  return {
    id,
    type: 'textbox',
    pageNumber: 1,
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
    data: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function drainDocumentQueue(): Promise<void> {
  await enqueueDocumentOperation(() => undefined);
}

describe('annotation store durable history', () => {
  beforeEach(() => {
    resetDocumentOperationQueueForTests();
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    useAnnotationStore.setState({
      annotations: [],
      activeAnnotationId: null,
      selectedAnnotationIds: [],
      clipboard: [],
    });
    useWriterV2Store.getState().clearWriterV2();
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
  });

  async function openJournalAwareSession() {
    const revisions = new MemoryRevisionStore({
      id: 'annotation-durable-revisions',
    });
    registerWorkingRevisionStore(revisions);

    const journal = new MemoryHistoryJournalStore({
      id: 'annotation-durable-journal',
    });
    registerHistoryJournalStore(journal);

    await journal.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-annotations',
        revisionStoreId: revisions.id,
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    useSessionStore.getState().openDocument({
      documentKey: 'sha256:one',
      revisionStoreId: revisions.id,
      originalRevisionId: 'sha256:one',
      activeRevisionId: 'sha256:one',
      historyJournalStoreId: journal.id,
      historyJournalId: 'history-annotations',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    return journal;
  }

  it('commits a journal-aware annotation edit with a state checkpoint', async () => {
    const journal = await openJournalAwareSession();

    useAnnotationStore
      .getState()
      .addAnnotation(annotation('a1'));

    await drainDocumentQueue();

    expect(
      useAnnotationStore
        .getState()
        .annotations.map((item) => item.id),
    ).toEqual(['a1']);

    const transaction =
      useHistoryStore.getState().undoStack.at(-1);
    expect(transaction?.command.type).toBe(
      'ANNOTATION_CHANGE',
    );

    await expect(
      journal.load('history-annotations'),
    ).resolves.toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: transaction?.id,
      entries: [{
        transactionId: transaction?.id,
        command: {
          type: 'ANNOTATION_CHANGE',
        },
        beforeRevision: {
          revisionId: 'sha256:one',
        },
        afterRevision: {
          revisionId: 'sha256:one',
        },
      }],
      checkpoints: [
        { kind: 'ADMISSION' },
        {
          kind: 'BARRIER',
          transactionId: transaction?.id,
          statePayload: {
            annotations: [{
              id: 'a1',
            }],
          },
        },
      ],
    });
  });

  it('derives rapid queued annotation edits from sequential committed state', async () => {
    const journal = await openJournalAwareSession();

    const store = useAnnotationStore.getState();
    store.addAnnotation(annotation('a1'));
    store.addAnnotation(annotation('a2'));

    await drainDocumentQueue();

    expect(
      useAnnotationStore
        .getState()
        .annotations.map((item) => item.id),
    ).toEqual(['a1', 'a2']);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(2);

    const manifest =
      await journal.load('history-annotations');
    expect(manifest?.entries).toHaveLength(2);
    expect(manifest?.activeTransactionId).toBe(
      useHistoryStore.getState().undoStack.at(-1)?.id,
    );
    expect(
      manifest?.checkpoints
        .filter((checkpoint) =>
          checkpoint.kind === 'BARRIER'
        )
        .at(-1)
        ?.statePayload
        ?.annotations
        .map((item) => item.id),
    ).toEqual(['a1', 'a2']);
  });

  it('rejects unsafe custom stamp data before applying annotation state', async () => {
    const journal = await openJournalAwareSession();

    useAnnotationStore.getState().addAnnotation(
      annotation('unsafe-stamp', {
        type: 'stamp',
        data: {
          stampImageDataUrl:
            'data:image/png;base64,AAAA',
        },
      }),
    );

    await drainDocumentQueue();

    expect(
      useAnnotationStore.getState().annotations,
    ).toEqual([]);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
    await expect(
      journal.load('history-annotations'),
    ).resolves.toMatchObject({
      activeTransactionId: null,
      entries: [],
    });
  });

  it('rolls annotation, history and session dirty state back when journal save fails', async () => {
    const journal = await openJournalAwareSession();
    vi.spyOn(journal, 'save').mockRejectedValueOnce(
      new Error('journal write failed'),
    );

    useAnnotationStore
      .getState()
      .addAnnotation(annotation('a1'));

    await drainDocumentQueue();

    expect(
      useAnnotationStore.getState().annotations,
    ).toEqual([]);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
    expect(useSessionStore.getState().isDirty).toBe(
      false,
    );
    await expect(
      journal.load('history-annotations'),
    ).resolves.toMatchObject({
      activeTransactionId: null,
      entries: [],
    });
  });

  it('keeps legacy no-journal annotation mutation synchronous', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'legacy-doc',
      fileName: 'legacy.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    useAnnotationStore
      .getState()
      .addAnnotation(annotation('legacy-a1'));

    expect(
      useAnnotationStore
        .getState()
        .annotations.map((item) => item.id),
    ).toEqual(['legacy-a1']);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(1);
  });

  it('keeps selection and hydration operations synchronous', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      annotation('a1'),
      annotation('a2'),
    ]);
    store.setSelection(['a2']);

    expect(
      useAnnotationStore.getState(),
    ).toMatchObject({
      selectedAnnotationIds: ['a2'],
      activeAnnotationId: 'a2',
    });

    store.copySelection();
    expect(
      useAnnotationStore.getState().clipboard
        .map((item) => item.id),
    ).toEqual(['a2']);
  });
});
