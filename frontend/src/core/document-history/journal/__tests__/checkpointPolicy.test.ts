import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  materializePdfCommand,
} from '@/core/commands/types';
import type {
  HistoryState,
} from '../../types';
import {
  createHistoryStateCheckpointPayload,
} from '../stateCheckpoint';
import {
  createInitialHistoryJournalManifest,
  type HistoryJournalEntry,
  type HistoryJournalManifest,
} from '../types';
import {
  evaluateHistoryPeriodicCheckpoint,
  type HistoryPeriodicCheckpointPolicy,
} from '../checkpointPolicy';

const POLICY:
HistoryPeriodicCheckpointPolicy = {
  maxTransactionsSinceCheckpoint: 3,
  maxJournalBytesSinceCheckpoint:
    1_000_000,
  maxElapsedMsSinceCheckpoint:
    60_000,
};

function entry(
  transactionId: string,
  beforeRevisionId: string,
  afterRevisionId: string,
  createdAt: string,
): HistoryJournalEntry {
  return {
    entryId:
      `history-1:entry:${transactionId}`,
    transactionId,
    command: materializePdfCommand(
      {
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      'toolbar',
      beforeRevisionId,
      {
        id:
          `command-${transactionId}`,
        createdAt,
      },
    ),
    disposition:
      'SELF_CONTAINED_REPLAY',
    barriers: [],
    beforeRevision: {
      storeId: 'revision-store',
      revisionId:
        beforeRevisionId,
    },
    afterRevision: {
      storeId: 'revision-store',
      revisionId:
        afterRevisionId,
    },
    createdAt,
  };
}

function state(
  revisionId: string,
): HistoryState {
  return {
    revision: {
      storeId: 'revision-store',
      revisionId,
    },
    activeRevisionId: revisionId,
    documentKey: revisionId,
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
      documentFingerprint:
        revisionId,
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [0],
      reviewFocus: null,
    },
  };
}

function manifestWithAnchor():
HistoryJournalManifest {
  const manifest =
    createInitialHistoryJournalManifest({
      journalId: 'history-1',
      revisionStoreId:
        'revision-store',
      revisionId: 'sha256:origin',
      fileName: 'fixture.pdf',
      createdAt:
        '2026-09-20T08:00:00.000Z',
    });

  const anchorEntry =
    entry(
      'tx-anchor',
      'sha256:origin',
      'sha256:anchor',
      '2026-09-20T08:00:01.000Z',
    );
  manifest.entries.push(
    anchorEntry,
  );
  manifest.checkpoints.push({
    checkpointId:
      'history-1:periodic:tx-anchor',
    kind: 'PERIODIC',
    revision: {
      storeId: 'revision-store',
      revisionId:
        'sha256:anchor',
    },
    transactionId: 'tx-anchor',
    createdAt:
      '2026-09-20T08:00:01.000Z',
    statePayload:
      createHistoryStateCheckpointPayload(
        state('sha256:anchor'),
      ),
  });
  manifest.activeRevisionId =
    'sha256:anchor';
  manifest.activeTransactionId =
    'tx-anchor';
  return manifest;
}

describe(
  'evaluateHistoryPeriodicCheckpoint',
  () => {
    it('bootstraps the first recovery-complete checkpoint for a self-contained history', () => {
      const manifest =
        createInitialHistoryJournalManifest({
          journalId: 'history-1',
          revisionStoreId:
            'revision-store',
          revisionId:
            'sha256:origin',
          fileName: 'fixture.pdf',
          createdAt:
            '2026-09-20T08:00:00.000Z',
        });
      manifest.entries.push(
        entry(
          'tx-1',
          'sha256:origin',
          'sha256:one',
          '2026-09-20T08:00:01.000Z',
        ),
      );

      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-1',
          POLICY,
        ),
      ).toMatchObject({
        due: true,
        reasons: [
          'BOOTSTRAP_RECOVERY_POINT',
        ],
        transactionsSinceCheckpoint: 1,
        anchorCheckpointId: null,
      });
    });

    it('triggers exactly at the transaction-count bound', () => {
      const manifest =
        manifestWithAnchor();
      manifest.entries.push(
        entry(
          'tx-1',
          'sha256:anchor',
          'sha256:one',
          '2026-09-20T08:00:02.000Z',
        ),
        entry(
          'tx-2',
          'sha256:one',
          'sha256:two',
          '2026-09-20T08:00:03.000Z',
        ),
        entry(
          'tx-3',
          'sha256:two',
          'sha256:three',
          '2026-09-20T08:00:04.000Z',
        ),
      );

      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-2',
          POLICY,
        ).due,
      ).toBe(false);
      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-3',
          POLICY,
        ),
      ).toMatchObject({
        due: true,
        reasons: [
          'TRANSACTION_COUNT',
        ],
        transactionsSinceCheckpoint: 3,
        anchorTransactionId:
          'tx-anchor',
      });
    });

    it('triggers on serialized journal-entry bytes', () => {
      const manifest =
        manifestWithAnchor();
      const large =
        entry(
          'tx-large',
          'sha256:anchor',
          'sha256:large',
          '2026-09-20T08:00:02.000Z',
        );
      if (
        large.command.type
        !== 'ROTATE_PAGES'
      ) {
        throw new Error(
          'fixture requires rotate command',
        );
      }
      large.command.groupId =
        'x'.repeat(2_000);
      manifest.entries.push(large);

      const result =
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-large',
          {
            ...POLICY,
            maxTransactionsSinceCheckpoint:
              100,
            maxJournalBytesSinceCheckpoint:
              500,
          },
        );

      expect(result.due).toBe(true);
      expect(result.reasons).toContain(
        'JOURNAL_BYTES',
      );
      expect(
        result.journalBytesSinceCheckpoint,
      ).toBeGreaterThanOrEqual(500);
    });

    it('triggers elapsed time only on a later durable transaction boundary', () => {
      const manifest =
        manifestWithAnchor();
      manifest.entries.push(
        entry(
          'tx-late',
          'sha256:anchor',
          'sha256:late',
          '2026-09-20T08:01:01.000Z',
        ),
      );

      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-late',
          {
            ...POLICY,
            maxTransactionsSinceCheckpoint:
              100,
          },
        ),
      ).toMatchObject({
        due: true,
        reasons: ['ELAPSED_TIME'],
        elapsedMsSinceCheckpoint:
          60_000,
      });
    });

    it('uses the latest recovery-complete checkpoint as the cadence reset', () => {
      const manifest =
        manifestWithAnchor();
      manifest.entries.push(
        entry(
          'tx-1',
          'sha256:anchor',
          'sha256:one',
          '2026-09-20T08:00:02.000Z',
        ),
      );
      manifest.checkpoints.push({
        checkpointId:
          'history-1:barrier:tx-1',
        kind: 'BARRIER',
        revision: {
          storeId:
            'revision-store',
          revisionId:
            'sha256:one',
        },
        transactionId: 'tx-1',
        createdAt:
          '2026-09-20T08:00:02.000Z',
        statePayload:
          createHistoryStateCheckpointPayload(
            state('sha256:one'),
          ),
      });
      manifest.entries.push(
        entry(
          'tx-2',
          'sha256:one',
          'sha256:two',
          '2026-09-20T08:00:03.000Z',
        ),
      );

      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-2',
          POLICY,
        ),
      ).toMatchObject({
        due: false,
        transactionsSinceCheckpoint: 1,
        anchorTransactionId: 'tx-1',
      });
    });

    it('never schedules periodic checkpoints for checkpoint-required transactions', () => {
      const manifest =
        manifestWithAnchor();
      const candidate =
        entry(
          'tx-barrier',
          'sha256:anchor',
          'sha256:after',
          '2026-09-20T08:10:00.000Z',
        );
      candidate.disposition =
        'CHECKPOINT_REQUIRED';
      candidate.barriers = [{
        code:
          'DONOR_RESOURCE_REQUIRED',
        resourceIds: ['donor-a'],
      }];
      manifest.entries.push(candidate);

      expect(
        evaluateHistoryPeriodicCheckpoint(
          manifest,
          'tx-barrier',
          {
            ...POLICY,
            maxTransactionsSinceCheckpoint:
              1,
          },
        ),
      ).toMatchObject({
        due: false,
        reasons: [],
      });
    });
  },
);
