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
  prepareHistoryJournalMutation,
} from '../appendMutation';
import {
  prepareHistoryJournalNavigation,
} from '../navigation';

describe('prepareHistoryJournalNavigation', () => {
  beforeEach(() => {
    clearHistoryJournalStoreRegistryForTests();
  });

  it('moves active revision without deleting the redo tail', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'navigation-journal',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-nav',
        revisionStoreId: 'revision-store',
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    const first = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-nav',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:one',
      afterRevisionId: 'sha256:two',
      transactionId: 'tx-1',
      command: materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:one',
      ),
    });
    expect(first).not.toBeNull();
    if (!first) return;
    await first.store.save(first.manifest);

    const second = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-nav',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:two',
      afterRevisionId: 'sha256:three',
      transactionId: 'tx-2',
      command: materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:two',
      ),
    });
    expect(second).not.toBeNull();
    if (!second) return;
    await second.store.save(second.manifest);

    const navigation =
      await prepareHistoryJournalNavigation({
        journalStoreId: store.id,
        journalId: 'history-nav',
        revisionStoreId: 'revision-store',
        currentRevisionId: 'sha256:three',
        targetRevisionId: 'sha256:two',
        direction: 'undo',
        transactionId: 'tx-2',
      });

    expect(navigation?.manifest.activeRevisionId).toBe(
      'sha256:two',
    );
    expect(
      navigation?.manifest.activeTransactionId,
    ).toBe('tx-1');
    expect(navigation?.manifest.entries).toHaveLength(2);
  });

  it('moves the logical cursor when adjacent transactions share one PDF revision', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'same-revision-journal',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-same-revision',
        revisionStoreId: 'revision-store',
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    const first = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-same-revision',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:one',
      afterRevisionId: 'sha256:one',
      transactionId: 'state-tx-1',
      command: materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:one',
      ),
    });
    expect(first).not.toBeNull();
    if (!first) return;
    await first.store.save(first.manifest);

    const second = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-same-revision',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:one',
      afterRevisionId: 'sha256:one',
      transactionId: 'state-tx-2',
      command: materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:one',
      ),
    });
    expect(second).not.toBeNull();
    if (!second) return;
    await second.store.save(second.manifest);

    const undo =
      await prepareHistoryJournalNavigation({
        journalStoreId: store.id,
        journalId: 'history-same-revision',
        revisionStoreId: 'revision-store',
        currentRevisionId: 'sha256:one',
        targetRevisionId: 'sha256:one',
        direction: 'undo',
        transactionId: 'state-tx-2',
      });

    expect(undo?.manifest).toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: 'state-tx-1',
    });
    if (!undo) return;
    await undo.store.save(undo.manifest);

    const redo =
      await prepareHistoryJournalNavigation({
        journalStoreId: store.id,
        journalId: 'history-same-revision',
        revisionStoreId: 'revision-store',
        currentRevisionId: 'sha256:one',
        targetRevisionId: 'sha256:one',
        direction: 'redo',
        transactionId: 'state-tx-2',
      });

    expect(redo?.manifest).toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: 'state-tx-2',
    });
  });

  it('fails when session and journal heads disagree', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'navigation-stale',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-stale',
        revisionStoreId: 'revision-store',
        revisionId: 'sha256:one',
        fileName: 'fixture.pdf',
      }),
    );

    await expect(
      prepareHistoryJournalNavigation({
        journalStoreId: store.id,
        journalId: 'history-stale',
        revisionStoreId: 'revision-store',
        currentRevisionId: 'sha256:wrong',
        targetRevisionId: 'sha256:one',
        direction: 'undo',
        transactionId: 'missing',
      }),
    ).rejects.toThrow(/does not match session revision/);
  });
});
