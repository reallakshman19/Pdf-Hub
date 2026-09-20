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
import type { HistoryState } from '../types';
import {
  attachHistoryJournalBarrierState,
  prepareHistoryJournalMutation,
} from '../appendMutation';

function rotateCommand(
  documentKey = 'sha256:before',
  id = 'rotate-command',
  createdAt =
    '2026-09-19T00:00:00.000Z',
) {
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
      createdAt,
    },
  );
}

function recoveryAfterState(
  revisionId = 'sha256:after',
): HistoryState {
  return {
    revision: {
      storeId: 'revision-store',
      revisionId,
    },
    activeRevisionId: revisionId,
    pageCount: 1,
    pageGraph: {
      pages: [{
        pageId: 'page-1',
        documentKey: revisionId,
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
      }],
    },
    documentKey: revisionId,
    selectedPageIds: ['page-1'],
    selectedPages: [1],
    currentPageId: 'page-1',
    currentPage: 1,
    annotations: [],
    writer: {
      documentMode: 'pdfOverlay',
      elements: [],
      selectedIds: [],
      activeId: null,
    },
    ocr: {
      documentFingerprint: revisionId,
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [0],
      reviewFocus: null,
    },
  };
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

  it('bootstraps a recovery-complete periodic checkpoint on the first replayable mutation', async () => {
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
      activeTransactionId: 'tx-1',
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
      checkpoints: [
        { kind: 'ADMISSION' },
        {
          kind: 'PERIODIC',
          transactionId: 'tx-1',
          revision: {
            revisionId: 'sha256:after',
          },
        },
      ],
    });
    expect(
      prepared?.periodicCheckpointDecision,
    ).toMatchObject({
      due: true,
      reasons: [
        'BOOTSTRAP_RECOVERY_POINT',
      ],
    });

    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(
      attachHistoryJournalBarrierState({
        manifest: prepared.manifest,
        transactionId: 'tx-1',
        after: recoveryAfterState(),
      }),
    ).toBe(true);
    expect(
      prepared.manifest.checkpoints[1],
    ).toMatchObject({
      kind: 'PERIODIC',
      statePayload: {
        schemaVersion: 2,
        documentKey: 'sha256:after',
      },
    });
  });

  it('does not add another periodic checkpoint before any policy bound is reached', async () => {
    const store = await setup();

    const first =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:before',
        afterRevisionId: 'sha256:one',
        transactionId: 'tx-1',
        command: rotateCommand(),
        createdAt: '2026-09-19T00:00:01.000Z',
      });
    expect(first).not.toBeNull();
    if (!first) return;

    const firstAfter =
      recoveryAfterState(
        'sha256:one',
      );

    expect(
      attachHistoryJournalBarrierState({
        manifest: first.manifest,
        transactionId: 'tx-1',
        after: firstAfter,
      }),
    ).toBe(true);
    await first.store.save(
      first.manifest,
    );

    const secondCommand =
      materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:one',
        {
          id: 'rotate-command-2',
          createdAt:
            '2026-09-19T00:00:02.000Z',
        },
      );
    const second =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:one',
        afterRevisionId: 'sha256:two',
        transactionId: 'tx-2',
        command: secondCommand,
        createdAt: '2026-09-19T00:00:02.000Z',
      });

    expect(
      second?.periodicCheckpointDecision,
    ).toMatchObject({
      due: false,
      transactionsSinceCheckpoint: 1,
      anchorTransactionId: 'tx-1',
    });
    expect(
      second?.manifest.checkpoints,
    ).toHaveLength(2);
  });

  it('schedules a periodic checkpoint when a configured bound is reached', async () => {
    const store = await setup();

    const first =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:before',
        afterRevisionId: 'sha256:one',
        transactionId: 'tx-1',
        command: rotateCommand(),
        createdAt: '2026-09-19T00:00:01.000Z',
      });
    expect(first).not.toBeNull();
    if (!first) return;

    const firstAfter =
      recoveryAfterState(
        'sha256:one',
      );
    attachHistoryJournalBarrierState({
      manifest: first.manifest,
      transactionId: 'tx-1',
      after: firstAfter,
    });
    await first.store.save(
      first.manifest,
    );

    const secondCommand =
      materializePdfCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        'toolbar',
        'sha256:one',
        {
          id: 'rotate-command-2',
          createdAt:
            '2026-09-19T00:00:02.000Z',
        },
      );
    const second =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId: 'revision-store',
        beforeRevisionId: 'sha256:one',
        afterRevisionId: 'sha256:two',
        transactionId: 'tx-2',
        command: secondCommand,
        createdAt: '2026-09-19T00:00:02.000Z',
        checkpointPolicy: {
          maxTransactionsSinceCheckpoint: 1,
          maxJournalBytesSinceCheckpoint:
            1_000_000,
          maxElapsedMsSinceCheckpoint:
            60_000,
        },
      });

    expect(
      second?.periodicCheckpointDecision,
    ).toMatchObject({
      due: true,
      reasons: ['TRANSACTION_COUNT'],
    });
    expect(
      second?.manifest.checkpoints.at(-1),
    ).toMatchObject({
      kind: 'PERIODIC',
      transactionId: 'tx-2',
      revision: {
        revisionId: 'sha256:two',
      },
    });
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
    expect(
      prepared?.periodicCheckpointDecision,
    ).toBeNull();
    expect(prepared?.manifest.checkpoints[1]).toMatchObject({
      kind: 'BARRIER',
      transactionId: 'tx-barrier',
      revision: {
        revisionId: 'sha256:after',
      },
    });

    expect(prepared).not.toBeNull();
    if (!prepared) return;

    expect(
      attachHistoryJournalBarrierState({
        manifest: prepared.manifest,
        transactionId: 'tx-barrier',
        after: recoveryAfterState(),
      }),
    ).toBe(true);
    expect(
      prepared.manifest.checkpoints[1],
    ).toMatchObject({
      statePayload: {
        schemaVersion: 2,
        pageCount: 1,
        documentKey: 'sha256:after',
        pageGraph: {
          pages: [{ pageId: 'page-1' }],
        },
        ocr: {
          documentFingerprint: 'sha256:after',
        },
      },
    });
  });

  it('uses a recovery-complete barrier as the next periodic cadence reset', async () => {
    const store = await setup();
    const barrierCommand =
      materializePdfCommand(
        {
          type: 'INSERT_PAGES',
          payload: {
            atIndex: 1,
            donorResourceId:
              'donor-a',
          },
        },
        'toolbar',
        'sha256:before',
        {
          id: 'barrier-command',
          createdAt:
            '2026-09-19T00:00:01.000Z',
        },
      );

    const barrier =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId:
          'revision-store',
        beforeRevisionId:
          'sha256:before',
        afterRevisionId:
          'sha256:barrier',
        transactionId:
          'tx-barrier-reset',
        command: barrierCommand,
        createdAt:
          '2026-09-19T00:00:01.000Z',
      });
    expect(barrier).not.toBeNull();
    if (!barrier) return;
    expect(
      attachHistoryJournalBarrierState({
        manifest: barrier.manifest,
        transactionId:
          'tx-barrier-reset',
        after:
          recoveryAfterState(
            'sha256:barrier',
          ),
      }),
    ).toBe(true);
    await barrier.store.save(
      barrier.manifest,
    );

    const next =
      await prepareHistoryJournalMutation({
        journalStoreId: store.id,
        journalId: 'history-1',
        revisionStoreId:
          'revision-store',
        beforeRevisionId:
          'sha256:barrier',
        afterRevisionId:
          'sha256:next',
        transactionId: 'tx-next',
        command: rotateCommand(
          'sha256:barrier',
          'rotate-after-barrier',
          '2026-09-19T00:00:02.000Z',
        ),
        createdAt:
          '2026-09-19T00:00:02.000Z',
        checkpointPolicy: {
          maxTransactionsSinceCheckpoint:
            2,
          maxJournalBytesSinceCheckpoint:
            1_000_000,
          maxElapsedMsSinceCheckpoint:
            60_000,
        },
      });

    expect(
      next?.periodicCheckpointDecision,
    ).toMatchObject({
      due: false,
      transactionsSinceCheckpoint: 1,
      anchorCheckpointId:
        'history-1:barrier:tx-barrier-reset',
      anchorTransactionId:
        'tx-barrier-reset',
    });
    expect(
      next?.manifest.checkpoints.map(
        (checkpoint) =>
          checkpoint.kind,
      ),
    ).toEqual([
      'ADMISSION',
      'BARRIER',
    ]);
  });

  it('truncates an abandoned redo tail before appending a new branch', async () => {
    const store = await setup();

    const first = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-1',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:before',
      afterRevisionId: 'sha256:two',
      transactionId: 'tx-1',
      command: rotateCommand(
        'sha256:before',
        'rotate-tx-1',
        '2026-09-19T00:00:01.000Z',
      ),
      createdAt:
        '2026-09-19T00:00:01.000Z',
    });
    expect(first).not.toBeNull();
    if (!first) return;
    expect(
      attachHistoryJournalBarrierState({
        manifest: first.manifest,
        transactionId: 'tx-1',
        after:
          recoveryAfterState(
            'sha256:two',
          ),
      }),
    ).toBe(true);
    await first.store.save(first.manifest);

    const second = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-1',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:two',
      afterRevisionId: 'sha256:three',
      transactionId: 'tx-2',
      command: rotateCommand(
        'sha256:two',
        'rotate-tx-2',
        '2026-09-19T00:00:02.000Z',
      ),
      createdAt:
        '2026-09-19T00:00:02.000Z',
      checkpointPolicy: {
        maxTransactionsSinceCheckpoint: 1,
        maxJournalBytesSinceCheckpoint:
          1_000_000,
        maxElapsedMsSinceCheckpoint:
          60_000,
      },
    });
    expect(second).not.toBeNull();
    if (!second) return;
    expect(
      attachHistoryJournalBarrierState({
        manifest: second.manifest,
        transactionId: 'tx-2',
        after:
          recoveryAfterState(
            'sha256:three',
          ),
      }),
    ).toBe(true);
    await second.store.save(second.manifest);

    const undone = await store.load('history-1');
    expect(undone).not.toBeNull();
    if (!undone) return;
    undone.activeRevisionId = 'sha256:two';
    undone.activeTransactionId = 'tx-1';
    await store.save(undone);

    const branched = await prepareHistoryJournalMutation({
      journalStoreId: store.id,
      journalId: 'history-1',
      revisionStoreId: 'revision-store',
      beforeRevisionId: 'sha256:two',
      afterRevisionId: 'sha256:branch',
      transactionId: 'tx-branch',
      command: rotateCommand(
        'sha256:two',
        'rotate-branch',
        '2026-09-19T00:00:03.000Z',
      ),
      createdAt:
        '2026-09-19T00:00:03.000Z',
    });

    expect(
      branched?.manifest.entries.map(
        (entry) => entry.transactionId,
      ),
    ).toEqual(['tx-1', 'tx-branch']);
    expect(
      branched?.manifest.activeRevisionId,
    ).toBe('sha256:branch');
    expect(
      branched?.manifest.checkpoints.some(
        (checkpoint) =>
          checkpoint.transactionId
          === 'tx-2',
      ),
    ).toBe(false);
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