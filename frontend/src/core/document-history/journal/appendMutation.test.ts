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

function rotateCommand() {
  return materializePdfCommand(
    {
      type: 'ROTATE_PAGES',
      payload: {
        pageIndices: [0],
        angle: 90,
      },
    },
    'toolbar',
    'sha256:before',
    {
      id: 'rotate-command',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  );
}

describe('prepareHistoryJournalMutation', () => {
  beforeEach(() => {
    clearHistoryJournalStoreRegistryForTests();
  });

  async function setup() {
    const store = new MemoryHistoryJournalStore({
      id: 'journal-store',
    });
    registerHistoryJournalStore(store);
    await store.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        revisionId: 'sha256:before',
        fileName: 'fixture.pdf',
        createdAt: '2026-09-19T00:00:00.000Z',
      }),
    );
    return store;
  }

  it('appends a replayable mutation without adding a checkpoint', async () => {
    const store = await setup();

    const prepared =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:before',
        afterRevisionId: 'sha256:after',
        transactionId: 'tx-1',
        command: rotateCommand(),
        createdAt: '2026-09-19T00:00:01.000Z',
      });

    expect(prepared?.manifest).toMatchObject({
      activeRevisionId: 'sha256:after',
      entries: [{
        transactionId: 'tx-1',
        disposition: 'SELF_CONTAINED_REPLAY',
        beforeRevision: {
          revisionId: 'sha256:before',
        },
        afterRevision: {
          revisionId: 'sha256:after',
        },
      }],
    });
    expect(prepared?.manifest.checkpoints).toHaveLength(1);
  });

  it('adds a barrier checkpoint for donor-backed mutation', async () => {
    const store = await setup();
    const command = materializePdfCommand(
      {
        type: 'INSERT_PAGES',
        payload: {
          atIndex: 1,
          donorResourceId: 'donor-a',
        },
      },
      'toolbar',
      'sha256:before',
      {
        id: 'insert-command',
        createdAt: '2026-09-19T00:00:00.000Z',
      },
    );

    const prepared =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:before',
        afterRevisionId: 'sha256:after',
        transactionId: 'tx-barrier',
        command,
      });

    expect(prepared?.manifest.entries[0]).toMatchObject({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'DONOR_RESOURCE_REQUIRED',
        resourceIds: ['donor-a'],
      }],
    });
    expect(prepared?.manifest.checkpoints).toHaveLength(2);
    expect(prepared?.manifest.checkpoints[1]).toMatchObject({
      kind: 'BARRIER',
      transactionId: 'tx-barrier',
      revision: {
        revisionId: 'sha256:after',
      },
    });
  });

  it('fails closed when journal active revision does not match mutation input', async () => {
    const store = await setup();

    await expect(
      prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:wrong',
        afterRevisionId: 'sha256:after',
        transactionId: 'tx-stale',
        command: rotateCommand(),
      }),
    ).rejects.toThrow(/does not match mutation before revision/);
  });

  it('keeps legacy no-journal sessions outside durable journal work', async () => {
    await expect(
      prepareHistoryJournalMutation({
        journalStoreId: null,
        journalId: null,
        revisionStoreId: null,
        beforeRevisionId: null,
        afterRevisionId: null,
        transactionId: 'tx-legacy',
        command: rotateCommand(),
      }),
    ).resolves.toBeNull();
  });

  it('rejects artifact-only commands from the mutation path', async () => {
    const store = await setup();
    const command = materializePdfCommand(
      {
        type: 'EXTRACT_PAGES',
        payload: { pageIndices: [0] },
      },
      'toolbar',
      'sha256:before',
      {
        id: 'extract-command',
        createdAt: '2026-09-19T00:00:00.000Z',
      },
    );

    await expect(
      prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:before',
        afterRevisionId: 'sha256:after',
        transactionId: 'tx-artifact',
        command,
      }),
    ).rejects.toThrow(/Non-mutating command EXTRACT_PAGES/);
  });
});
