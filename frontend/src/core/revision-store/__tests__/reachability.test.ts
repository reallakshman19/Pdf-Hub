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
  Transaction,
} from '@/core/document-history/types';
import {
  createInitialHistoryJournalManifest,
  type HistoryJournalManifest,
} from '@/core/document-history/journal/types';
import {
  planRevisionReachability,
} from '../reachability';

const STORE_ID = 'shared-revisions';

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

function historyState(
  revisionId: string,
): HistoryState {
  return {
    revision: {
      storeId: STORE_ID,
      revisionId,
    },
    activeRevisionId: revisionId,
    documentKey: revisionId,
    pageCount: 1,
    pageGraph: null,
    selectedPageIds: [],
    selectedPages: [],
    currentPageId: null,
    currentPage: 1,
    annotations: [],
  };
}

function transaction(
  id: string,
  before: string,
  after: string,
): Transaction {
  return {
    id,
    command: command(id, before),
    label: id,
    timestamp: 1,
    before: historyState(before),
    after: historyState(after),
  };
}

function journal(
  journalId: string,
  original: string,
  after?: string,
): HistoryJournalManifest {
  const manifest =
    createInitialHistoryJournalManifest({
      journalId,
      revisionStoreId: STORE_ID,
      revisionId: original,
      fileName:
        `${journalId}.pdf`,
      createdAt:
        '2026-09-20T10:00:00.000Z',
    });

  if (!after) return manifest;

  const transactionId =
    `${journalId}-tx`;
  manifest.entries.push({
    entryId:
      `${journalId}:entry:${transactionId}`,
    transactionId,
    command:
      command(
        `${journalId}-command`,
        original,
      ),
    disposition:
      'SELF_CONTAINED_REPLAY',
    barriers: [],
    beforeRevision: {
      storeId: STORE_ID,
      revisionId: original,
    },
    afterRevision: {
      storeId: STORE_ID,
      revisionId: after,
    },
    createdAt:
      '2026-09-20T10:00:01.000Z',
  });
  manifest.checkpoints.push({
    checkpointId:
      `${journalId}:periodic:${transactionId}`,
    kind: 'PERIODIC',
    revision: {
      storeId: STORE_ID,
      revisionId: after,
    },
    transactionId,
    createdAt:
      '2026-09-20T10:00:01.000Z',
  });
  manifest.activeRevisionId = after;
  manifest.activeTransactionId =
    transactionId;
  manifest.updatedAt =
    '2026-09-20T10:00:01.000Z';
  return manifest;
}

describe(
  'planRevisionReachability',
  () => {
    it('protects all journals, live session, undo/redo and runtime pins in one shared store', () => {
      const result =
        planRevisionReachability({
          storeId: STORE_ID,
          inventory: [
            'journal-a-origin',
            'journal-a-active',
            'journal-b-origin',
            'session-original',
            'session-active',
            'undo-before',
            'undo-after',
            'redo-before',
            'redo-after',
            'pinned',
            'orphan',
          ],
          journals: [
            journal(
              'journal-a',
              'journal-a-origin',
              'journal-a-active',
            ),
            journal(
              'journal-b',
              'journal-b-origin',
            ),
          ],
          session: {
            revisionStoreId:
              STORE_ID,
            originalRevisionId:
              'session-original',
            activeRevisionId:
              'session-active',
          },
          undoStack: [
            transaction(
              'undo-tx',
              'undo-before',
              'undo-after',
            ),
          ],
          redoStack: [
            transaction(
              'redo-tx',
              'redo-before',
              'redo-after',
            ),
          ],
          pins: [{
            storeId: STORE_ID,
            revisionId: 'pinned',
            reason: 'export-1',
          }],
        });

      expect(result.safeToDelete)
        .toBe(true);
      expect(result.candidates)
        .toEqual(['orphan']);
      expect(
        result.reachable.map(
          (entry) =>
            entry.revisionId,
        ),
      ).toEqual([
        'journal-a-active',
        'journal-a-origin',
        'journal-b-origin',
        'pinned',
        'redo-after',
        'redo-before',
        'session-active',
        'session-original',
        'undo-after',
        'undo-before',
      ]);
      expect(
        result.reachable.find(
          (entry) =>
            entry.revisionId
            === 'pinned',
        )?.reasons,
      ).toContainEqual({
        kind: 'RUNTIME_PIN',
        sourceId: 'export-1',
      });
    });

    it('protects journal-only recovery references after a process restart', () => {
      const retained =
        journal(
          'restart-journal',
          'restart-origin',
          'restart-active',
        );

      const result =
        planRevisionReachability({
          storeId: STORE_ID,
          inventory: [
            'restart-origin',
            'restart-active',
            'orphan',
          ],
          journals: [retained],
          session: null,
          undoStack: [],
          redoStack: [],
          pins: [],
        });

      expect(result.safeToDelete)
        .toBe(true);
      expect(result.candidates)
        .toEqual(['orphan']);
      expect(
        result.reachable.map(
          (entry) =>
            entry.revisionId,
        ),
      ).toEqual([
        'restart-active',
        'restart-origin',
      ]);
    });

    it('fails closed when any retained reference is missing from inventory', () => {
      const retained =
        journal(
          'damaged-journal',
          'present-origin',
          'missing-active',
        );

      const result =
        planRevisionReachability({
          storeId: STORE_ID,
          inventory: [
            'present-origin',
            'orphan',
          ],
          journals: [retained],
        });

      expect(result.safeToDelete)
        .toBe(false);
      expect(result.candidates)
        .toEqual(['orphan']);
      expect(result.diagnostics)
        .toContainEqual({
          code:
            'MISSING_REFERENCED_REVISION',
          revisionId:
            'missing-active',
          message:
            'Referenced revision missing-active is missing from store shared-revisions.',
        });
    });

    it('ignores references belonging to a different revision store', () => {
      const other =
        createInitialHistoryJournalManifest({
          journalId: 'other',
          revisionStoreId:
            'other-store',
          revisionId: 'other-rev',
          fileName: 'other.pdf',
        });

      const result =
        planRevisionReachability({
          storeId: STORE_ID,
          inventory: ['candidate'],
          journals: [other],
          pins: [{
            storeId:
              'other-store',
            revisionId: 'candidate',
            reason: 'other',
          }],
        });

      expect(result.safeToDelete)
        .toBe(true);
      expect(result.reachable)
        .toEqual([]);
      expect(result.candidates)
        .toEqual(['candidate']);
    });
  },
);
