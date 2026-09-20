import { describe, expect, it } from 'vitest';

import {
  materializePdfCommand,
} from '@/core/commands/types';
import type { HistoryState } from '../../types';
import {
  createHistoryStateCheckpointPayload,
} from '../stateCheckpoint';
import type {
  HistoryJournalEntry,
  HistoryJournalManifest,
} from '../types';
import {
  planHistoryRecovery,
} from '../recoveryPlanner';

const STORE_ID = 'revision-store';
const JOURNAL_ID = 'history-recovery';

function rotateCommand(
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
    'toolbar',
    documentKey,
    {
      id,
      createdAt: '2026-09-20T08:00:00.000Z',
    },
  );
}

function donorCommand(
  id: string,
  documentKey: string,
) {
  return materializePdfCommand(
    {
      type: 'INSERT_PAGES',
      payload: {
        atIndex: 1,
        donorResourceId: 'donor-a',
      },
    },
    'toolbar',
    documentKey,
    {
      id,
      createdAt: '2026-09-20T08:00:00.000Z',
    },
  );
}

function state(
  documentKey: string,
): HistoryState {
  return {
    revision: {
      storeId: STORE_ID,
      revisionId: documentKey,
    },
    activeRevisionId: documentKey,
    documentKey,
    pageCount: 1,
    pageGraph: {
      pages: [{
        pageId: 'page-1',
        documentKey,
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
      documentFingerprint: documentKey,
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [0],
      reviewFocus: null,
    },
  };
}

function entry(input: {
  transactionId: string;
  beforeRevisionId: string;
  afterRevisionId: string;
  disposition:
    | 'SELF_CONTAINED_REPLAY'
    | 'CHECKPOINT_REQUIRED';
}): HistoryJournalEntry {
  const command =
    input.disposition === 'SELF_CONTAINED_REPLAY'
      ? rotateCommand(
          `command-${input.transactionId}`,
          input.beforeRevisionId,
        )
      : donorCommand(
          `command-${input.transactionId}`,
          input.beforeRevisionId,
        );

  return {
    entryId:
      `${JOURNAL_ID}:entry:${input.transactionId}`,
    transactionId: input.transactionId,
    command,
    disposition: input.disposition,
    barriers:
      input.disposition === 'CHECKPOINT_REQUIRED'
        ? [{
            code: 'DONOR_RESOURCE_REQUIRED',
            resourceIds: ['donor-a'],
          }]
        : [],
    beforeRevision: {
      storeId: STORE_ID,
      revisionId: input.beforeRevisionId,
    },
    afterRevision: {
      storeId: STORE_ID,
      revisionId: input.afterRevisionId,
    },
    createdAt: '2026-09-20T08:00:01.000Z',
  };
}

function manifestWithReplaySuffix(): HistoryJournalManifest {
  const checkpointState =
    createHistoryStateCheckpointPayload(
      state('sha256:checkpoint'),
    );
  const first = entry({
    transactionId: 'tx-checkpoint',
    beforeRevisionId: 'sha256:origin',
    afterRevisionId: 'sha256:checkpoint',
    disposition: 'CHECKPOINT_REQUIRED',
  });
  const second = entry({
    transactionId: 'tx-replay',
    beforeRevisionId: 'sha256:checkpoint',
    afterRevisionId: 'sha256:active',
    disposition: 'SELF_CONTAINED_REPLAY',
  });

  return {
    schemaVersion: 1,
    journalId: JOURNAL_ID,
    revisionStoreId: STORE_ID,
    originalRevisionId: 'sha256:origin',
    activeRevisionId: 'sha256:active',
    activeTransactionId: 'tx-replay',
    fileName: 'fixture.pdf',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:02.000Z',
    checkpoints: [{
      checkpointId:
        `${JOURNAL_ID}:admission`,
      kind: 'ADMISSION',
      revision: {
        storeId: STORE_ID,
        revisionId: 'sha256:origin',
      },
      createdAt: '2026-09-20T08:00:00.000Z',
    }, {
      checkpointId:
        `${JOURNAL_ID}:barrier:tx-checkpoint`,
      kind: 'BARRIER',
      revision: {
        storeId: STORE_ID,
        revisionId: 'sha256:checkpoint',
      },
      transactionId: 'tx-checkpoint',
      createdAt: '2026-09-20T08:00:01.000Z',
      statePayload: checkpointState,
    }],
    entries: [first, second],
  };
}

describe('planHistoryRecovery', () => {
  it('plans from the latest recovery-complete checkpoint through a replayable suffix', () => {
    const result =
      planHistoryRecovery(
        manifestWithReplaySuffix(),
      );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan).toMatchObject({
      fileName: 'fixture.pdf',
      originalRevisionId: 'sha256:origin',
      checkpointTransactionId: 'tx-checkpoint',
      activeTransactionId: 'tx-replay',
      revision: {
        storeId: STORE_ID,
        revisionId: 'sha256:checkpoint',
      },
      state: {
        schemaVersion: 2,
        documentKey: 'sha256:checkpoint',
        currentPageId: 'page-1',
      },
    });
    expect(
      result.plan.replayEntries.map(
        (candidate) =>
          candidate.transactionId,
      ),
    ).toEqual(['tx-replay']);
  });

  it('fails closed when replay to the active cursor crosses a checkpoint-required entry', () => {
    const manifest =
      manifestWithReplaySuffix();
    manifest.entries[1] = entry({
      transactionId: 'tx-replay',
      beforeRevisionId: 'sha256:checkpoint',
      afterRevisionId: 'sha256:active',
      disposition: 'CHECKPOINT_REQUIRED',
    });

    const result =
      planHistoryRecovery(manifest);

    expect(result).toMatchObject({
      ok: false,
      code: 'RECOVERY_SUFFIX_BLOCKED',
    });
  });

  it('rejects a recovery checkpoint whose PageId navigation disagrees with the PageGraph', () => {
    const manifest =
      manifestWithReplaySuffix();
    const checkpoint =
      manifest.checkpoints[1]!;
    if (
      !checkpoint.statePayload
      || checkpoint.statePayload.schemaVersion
        !== 2
    ) {
      throw new Error('fixture requires v2 payload');
    }
    checkpoint.statePayload.currentPageId =
      'missing-page';

    const result =
      planHistoryRecovery(manifest);

    expect(result).toMatchObject({
      ok: false,
      code: 'RECOVERY_CHECKPOINT_INVALID',
    });
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.message.includes(
            'currentPage/currentPageId',
          ),
      ),
    ).toBe(true);
  });

  it('does not treat a legacy v1 state checkpoint as recovery-complete', () => {
    const manifest =
      manifestWithReplaySuffix();
    manifest.checkpoints[1]!.statePayload = {
      schemaVersion: 1,
      annotations: [],
      writer: {
        elements: [],
        selectedIds: [],
        activeId: null,
      },
    };

    const result =
      planHistoryRecovery(manifest);

    expect(result).toMatchObject({
      ok: false,
      code: 'RECOVERY_CHECKPOINT_INVALID',
    });
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.message.includes(
            'legacy state payload v1',
          ),
      ),
    ).toBe(true);
  });

  it('fails when the checkpoint document identity does not match its immutable revision', () => {
    const manifest =
      manifestWithReplaySuffix();
    const checkpoint =
      manifest.checkpoints[1]!;
    if (
      !checkpoint.statePayload
      || checkpoint.statePayload.schemaVersion
        !== 2
    ) {
      throw new Error('fixture requires v2 payload');
    }
    checkpoint.statePayload.documentKey =
      'sha256:wrong';

    const result =
      planHistoryRecovery(manifest);

    expect(result).toMatchObject({
      ok: false,
      code: 'RECOVERY_CHECKPOINT_INVALID',
    });
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.message.includes(
            'does not match checkpoint revision',
          ),
      ),
    ).toBe(true);
  });
});
