import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '../registry';
import {
  createInitialHistoryJournalManifest,
} from '../types';
import {
  prepareHistoryJournalStateTransaction,
} from '../appendStateTransaction';

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
        after: {
          annotations: [],
          writer: {
            documentMode: 'pdfOverlay',
            elements: [],
            selectedIds: [],
            activeId: null,
          },
        },
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
            schemaVersion: 1,
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
        after: {
          annotations: [],
          writer: {
            elements: [],
            selectedIds: [],
            activeId: null,
          },
        },
      }),
    ).rejects.toThrow(/does not match in-memory history cursor/);
  });
});
