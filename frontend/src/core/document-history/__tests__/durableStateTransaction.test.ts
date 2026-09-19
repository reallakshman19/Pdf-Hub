import { beforeEach, describe, expect, it, vi } from 'vitest';

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
} from '../journal/registry';
import {
  createInitialHistoryJournalManifest,
} from '../journal/types';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '../store';
import type {
  StateHistorySnapshot,
} from '../stateTransaction';
import {
  commitDurableStateTransaction,
} from '../durableStateTransaction';

function state(
  annotationText: string,
): StateHistorySnapshot {
  return {
    annotations: annotationText
      ? [{
          id: 'annotation-1',
          type: 'textbox',
          pageNumber: 1,
          rect: {
            x: 10,
            y: 20,
            width: 100,
            height: 30,
          },
          data: {
            text: annotationText,
          },
          createdAt: 1,
          updatedAt: 2,
        }]
      : [],
    writer: {
      documentMode: 'pdfOverlay',
      elements: [],
      selectedIds: [],
      activeId: null,
    },
  };
}

function command() {
  return materializePdfCommand(
    {
      type: 'ANNOTATION_CHANGE',
      payload: {
        action: 'Edit annotations',
        annotationIds: ['annotation-1'],
      },
    },
    'annotation-store',
    'sha256:one',
    {
      id: 'annotation-command',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  );
}

describe('commitDurableStateTransaction', () => {
  beforeEach(() => {
    resetDocumentOperationQueueForTests();
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
  });

  async function openJournalAwareSession() {
    const revisions = new MemoryRevisionStore({
      id: 'state-revisions',
    });
    registerWorkingRevisionStore(revisions);

    const journal = new MemoryHistoryJournalStore({
      id: 'state-journal',
    });
    registerHistoryJournalStore(journal);
    await journal.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-state',
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
      historyJournalId: 'history-state',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    return journal;
  }

  it('commits a same-revision state checkpoint and shared history transaction id', async () => {
    const journal =
      await openJournalAwareSession();
    let applied = false;

    await expect(
      commitDurableStateTransaction({
        command: command(),
        label: 'Edit annotations',
        before: state('before'),
        after: state('after'),
        apply: () => {
          applied = true;
        },
        rollback: () => {
          applied = false;
        },
      }),
    ).resolves.toBe(true);

    expect(applied).toBe(true);
    const transaction =
      useHistoryStore.getState().undoStack.at(-1);
    expect(transaction).toBeDefined();

    await expect(
      journal.load('history-state'),
    ).resolves.toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: transaction?.id,
      entries: [{
        transactionId: transaction?.id,
        disposition: 'CHECKPOINT_REQUIRED',
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
              data: { text: 'after' },
            }],
          },
        },
      ],
    });
  });

  it('rejects unsafe state before calling apply', async () => {
    await openJournalAwareSession();
    const apply = vi.fn();

    const unsafe = state('after');
    unsafe.annotations[0]!.data.stampImageDataUrl =
      'data:image/png;base64,AAAA';

    await expect(
      commitDurableStateTransaction({
        command: command(),
        label: 'Unsafe annotations',
        before: state('before'),
        after: unsafe,
        apply,
        rollback: vi.fn(),
      }),
    ).rejects.toThrow(/inline data URI/);

    expect(apply).not.toHaveBeenCalled();
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
  });

  it('rolls caller state and history back when journal save fails', async () => {
    const journal =
      await openJournalAwareSession();
    vi.spyOn(journal, 'save').mockRejectedValueOnce(
      new Error('journal write failed'),
    );

    let value = 'before';

    await expect(
      commitDurableStateTransaction({
        command: command(),
        label: 'Failed annotation edit',
        before: state('before'),
        after: state('after'),
        apply: () => {
          value = 'after';
        },
        rollback: () => {
          value = 'before';
        },
      }),
    ).rejects.toThrow(/journal write failed/);

    expect(value).toBe('before');
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
    await expect(
      journal.load('history-state'),
    ).resolves.toMatchObject({
      activeTransactionId: null,
      entries: [],
    });
  });

  it('retains legacy no-journal behavior through the coordinator', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'sha256:one',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    let applied = false;
    await expect(
      commitDurableStateTransaction({
        command: command(),
        label: 'Legacy state edit',
        before: state('before'),
        after: state('after'),
        apply: () => {
          applied = true;
        },
        rollback: () => {
          applied = false;
        },
      }),
    ).resolves.toBe(true);

    expect(applied).toBe(true);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(1);
  });
});
