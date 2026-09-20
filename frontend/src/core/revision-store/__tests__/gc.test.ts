import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
  releaseHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import {
  createInitialHistoryJournalManifest,
} from '@/core/document-history/journal/types';
import {
  useHistoryStore,
} from '@/core/document-history/store';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import {
  clearRevisionPinsForTests,
} from '@/core/revision-store/pins';
import {
  releaseActiveSessionRevisionGcBlocker,
} from '@/core/revision-store/sessionGcBlocker';
import { useSessionStore } from '@/core/session/store';
import {
  executeRevisionGarbageCollection,
  planLiveRevisionGarbageCollection,
} from '../gc';

const STORE_ID = 'gc-revisions';
const JOURNAL_STORE_ID =
  'gc-journals';

class FailOnceMemoryRevisionStore
extends MemoryRevisionStore {
  private failed = false;

  override async remove(
    revisionId: string,
  ): Promise<void> {
    if (
      revisionId === 'orphan-b'
      && !this.failed
    ) {
      this.failed = true;
      throw new Error(
        'fixture removal failure',
      );
    }
    await super.remove(revisionId);
  }
}

function command(
  id: string,
  documentKey: string,
) {
  return materializePdfCommand(
    {
      type: 'ROTATE_PAGES',
      payload: {
        pageIndices: [0],
        angle: 90,
      },
    },
    'system',
    documentKey,
    {
      id,
      createdAt:
        '2026-09-20T10:00:00.000Z',
    },
  );
}

async function saveJournal(
  store: MemoryHistoryJournalStore,
  input: {
    journalId: string;
    original: string;
    active?: string;
  },
): Promise<void> {
  const manifest =
    createInitialHistoryJournalManifest({
      journalId: input.journalId,
      revisionStoreId: STORE_ID,
      revisionId: input.original,
      fileName:
        `${input.journalId}.pdf`,
      createdAt:
        '2026-09-20T10:00:00.000Z',
    });

  if (
    input.active
    && input.active
      !== input.original
  ) {
    const transactionId =
      `${input.journalId}-tx`;
    manifest.entries.push({
      entryId:
        `${input.journalId}:entry:${transactionId}`,
      transactionId,
      command:
        command(
          `${input.journalId}-command`,
          input.original,
        ),
      disposition:
        'SELF_CONTAINED_REPLAY',
      barriers: [],
      beforeRevision: {
        storeId: STORE_ID,
        revisionId:
          input.original,
      },
      afterRevision: {
        storeId: STORE_ID,
        revisionId:
          input.active,
      },
      createdAt:
        '2026-09-20T10:00:01.000Z',
    });
    manifest.activeRevisionId =
      input.active;
    manifest.activeTransactionId =
      transactionId;
    manifest.updatedAt =
      '2026-09-20T10:00:01.000Z';
  }

  await store.save(manifest);
}

async function seed(
  store: MemoryRevisionStore,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    await store.commit({
      revisionId: id,
      source: new MemorySource({
        id: `source-${id}`,
        bytes:
          Uint8Array.from([
            id.length,
          ]),
      }),
    });
  }
}

function registerStores(
  revisions: MemoryRevisionStore,
  journals:
    MemoryHistoryJournalStore,
): void {
  registerWorkingRevisionStore(
    revisions,
  );
  registerHistoryJournalStore(
    journals,
  );
}

describe(
  'revision garbage collection',
  () => {
    beforeEach(() => {
      resetDocumentOperationQueueForTests();
      clearWorkingRevisionStoreRegistryForTests();
      clearHistoryJournalStoreRegistryForTests();
      clearRevisionPinsForTests();
      releaseActiveSessionRevisionGcBlocker();
      useHistoryStore.setState({
        undoStack: [],
        redoStack: [],
        retainedBytes: 0,
        droppedTransactions: 0,
        lastTrimReason: 'none',
        overBudget: false,
      });
      useSessionStore.setState({
        revisionStoreId: null,
        originalRevisionId: null,
        activeRevisionId: null,
        historyJournalStoreId: null,
        historyJournalId: null,
        historyJournalPersistent:
          false,
      });
    });

    it('deletes only revisions unreachable from every retained journal', async () => {
      const revisions =
        new MemoryRevisionStore({
          id: STORE_ID,
        });
      const journals =
        new MemoryHistoryJournalStore({
          id: JOURNAL_STORE_ID,
        });
      registerStores(
        revisions,
        journals,
      );
      await seed(revisions, [
        'doc-a',
        'doc-b',
        'orphan',
      ]);
      await saveJournal(journals, {
        journalId: 'journal-a',
        original: 'doc-a',
      });
      await saveJournal(journals, {
        journalId: 'journal-b',
        original: 'doc-b',
      });

      const plan =
        await planLiveRevisionGarbageCollection({
          storeId: STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      expect(plan.candidates)
        .toEqual(['orphan']);

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).resolves.toEqual({
        status: 'completed',
        storeId: STORE_ID,
        deleted: ['orphan'],
        remaining: [],
      });
      await expect(
        revisions.listRevisionIds(),
      ).resolves.toEqual([
        'doc-a',
        'doc-b',
      ]);
    });

    it('rejects a stale plan before deleting when a candidate becomes journal-reachable', async () => {
      const revisions =
        new MemoryRevisionStore({
          id: STORE_ID,
        });
      const journals =
        new MemoryHistoryJournalStore({
          id: JOURNAL_STORE_ID,
        });
      registerStores(
        revisions,
        journals,
      );
      await seed(revisions, [
        'keep',
        'orphan',
      ]);
      await saveJournal(journals, {
        journalId: 'journal-keep',
        original: 'keep',
      });

      const plan =
        await planLiveRevisionGarbageCollection({
          storeId: STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      expect(plan.candidates)
        .toEqual(['orphan']);

      await saveJournal(journals, {
        journalId: 'journal-new',
        original: 'orphan',
      });

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).rejects.toMatchObject({
        code: 'STALE_PLAN',
      });
      await expect(
        revisions.listRevisionIds(),
      ).resolves.toEqual([
        'keep',
        'orphan',
      ]);
    });

    it('returns partial failure and safely retries the same plan', async () => {
      const revisions =
        new FailOnceMemoryRevisionStore({
          id: STORE_ID,
        });
      const journals =
        new MemoryHistoryJournalStore({
          id: JOURNAL_STORE_ID,
        });
      registerStores(
        revisions,
        journals,
      );
      await seed(revisions, [
        'keep',
        'orphan-a',
        'orphan-b',
      ]);
      await saveJournal(journals, {
        journalId: 'journal-keep',
        original: 'keep',
      });

      const plan =
        await planLiveRevisionGarbageCollection({
          storeId: STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).resolves.toEqual({
        status: 'partial',
        storeId: STORE_ID,
        deleted: ['orphan-a'],
        remaining: ['orphan-b'],
        failed: {
          revisionId: 'orphan-b',
          message:
            'fixture removal failure',
        },
      });

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).resolves.toEqual({
        status: 'completed',
        storeId: STORE_ID,
        deleted: ['orphan-b'],
        remaining: [],
      });
      await expect(
        revisions.listRevisionIds(),
      ).resolves.toEqual(['keep']);
    });

    it('fails closed before remove when retained journal references are missing', async () => {
      const revisions =
        new MemoryRevisionStore({
          id: STORE_ID,
        });
      const journals =
        new MemoryHistoryJournalStore({
          id: JOURNAL_STORE_ID,
        });
      registerStores(
        revisions,
        journals,
      );
      await seed(revisions, [
        'orphan',
      ]);
      await saveJournal(journals, {
        journalId: 'damaged',
        original:
          'missing-original',
      });

      const plan =
        await planLiveRevisionGarbageCollection({
          storeId: STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      expect(plan.safeToDelete)
        .toBe(false);

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).rejects.toMatchObject({
        code:
          'UNSAFE_REACHABILITY',
      });
      await expect(
        revisions.listRevisionIds(),
      ).resolves.toEqual([
        'orphan',
      ]);
    });

    it('fails closed if complete journal inventory becomes unavailable after planning', async () => {
      const revisions =
        new MemoryRevisionStore({
          id: STORE_ID,
        });
      const journals =
        new MemoryHistoryJournalStore({
          id: JOURNAL_STORE_ID,
        });
      registerStores(
        revisions,
        journals,
      );
      await seed(revisions, [
        'keep',
        'orphan',
      ]);
      await saveJournal(journals, {
        journalId: 'journal-keep',
        original: 'keep',
      });

      const plan =
        await planLiveRevisionGarbageCollection({
          storeId: STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      releaseHistoryJournalStore(
        JOURNAL_STORE_ID,
      );

      await expect(
        executeRevisionGarbageCollection(
          plan,
        ),
      ).rejects.toMatchObject({
        code:
          'JOURNAL_STORE_UNAVAILABLE',
      });
      await expect(
        revisions.listRevisionIds(),
      ).resolves.toEqual([
        'keep',
        'orphan',
      ]);
    });
  },
);
