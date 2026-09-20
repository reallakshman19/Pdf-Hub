import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '../registry';
import type { HistoryState } from '../../types';
import {
  createInitialHistoryJournalManifest,
} from '../types';
import {
  prepareHistoryJournalStateTransaction,
} from '../appendStateTransaction';

function afterState(): HistoryState {
  return {
    revision: {
      storeId: 'revisions',
      revisionId: 'sha256:one',
    },
    activeRevisionId: 'sha256:one',
    pageCount: 1,
    pageGraph: null,
    documentKey: 'sha256:one',
    selectedPageIds: [],
    selectedPages: [],
    currentPageId: null,
    currentPage: 1,
    annotations: [],
    writer: {
      documentMode: 'pdfOverlay',
      elements: [],
      selectedIds: [],
      activeId: null,
    },
    ocr: {
      documentFingerprint:
        'sha256:one',
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [],
      reviewFocus: null,
    },
  };
}

describe('prepareHistoryJournalStateTransaction', () => {
  beforeEach(() => {
    clearHistoryJournalStoreRegistryForTests();
  });

  it('appends a same-revision descriptive barrier with after-state payload', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'state-journal',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-state',
        revisionStoreId: 'revisions',
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    const prepared =
      await prepareHistoryJournalStateTransaction({
        journalStoreId: store.id,
        journalId: 'history-state',
        revisionStoreId: 'revisions',
        revisionId: 'sha256:one',
        transactionId: 'tx-state',
        currentTransactionId: null,
        command: materializePdfCommand(
          {
            type: 'WRITER_CHANGE',
            payload: {
              action: 'Move Writer element',
              elementIds: ['writer-1'],
            },
          },
          'writer-store',
          'sha256:one',
        ),
        after: afterState(),
      });

    expect(prepared?.manifest).toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: 'tx-state',
      entries: [{
        transactionId: 'tx-state',
        disposition: 'CHECKPOINT_REQUIRED',
        barriers: [{
          code: 'DESCRIPTIVE_STATE_COMMAND',
        }],
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
          transactionId: 'tx-state',
          statePayload: {
            schemaVersion: 2,
            pageCount: 1,
            documentKey: 'sha256:one',
            ocr: {
              selectedPageIndexes: [],
            },
          },
        },
      ],
    });
  });

  it('fails closed when journal and in-memory history cursors disagree', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'state-stale',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-stale',
        revisionStoreId: 'revisions',
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    await expect(
      prepareHistoryJournalStateTransaction({
        journalStoreId: store.id,
        journalId: 'history-stale',
        revisionStoreId: 'revisions',
        revisionId: 'sha256:one',
        transactionId: 'tx-state',
        currentTransactionId: 'unexpected',
        command: materializePdfCommand(
          {
            type: 'ANNOTATION_CHANGE',
            payload: {
              action: 'Edit',
              annotationIds: [],
            },
          },
          'annotation-store',
          'sha256:one',
        ),
        after: afterState(),
      }),
    ).rejects.toThrow(/does not match in-memory history cursor/);
  });
});
