import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  enqueueDocumentOperation,
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
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useHistoryStore } from '../store';
import type {
  StateHistorySnapshot,
} from '../stateTransaction';
import {
  commitDurableStateMutation,
  commitDurableStateTransaction,
  StaleDurableStateMutationError,
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
    useOcrStore.getState().clearOcr();
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
            schemaVersion: 2,
            pageCount: 1,
            documentKey: 'sha256:one',
            currentPage: 1,
            annotations: [{
              data: { text: 'after' },
            }],
            ocr: {
              result: null,
              corrections: [],
              regions: [],
              selectedPageIndexes: [],
              reviewFocus: null,
            },
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
          useSessionStore.getState().setDirty(true);
        },
        rollback: () => {
          value = 'before';
        },
      }),
    ).rejects.toThrow(/journal write failed/);

    expect(value).toBe('before');
    expect(useSessionStore.getState().isDirty).toBe(false);
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

  it('evaluates queued lazy mutation factories against sequential committed state', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'sha256:one',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    let value = 0;
    const observedBefore: number[] = [];

    const queueMutation = () =>
      commitDurableStateMutation(() => {
        const beforeValue = value;
        observedBefore.push(beforeValue);
        const afterValue = beforeValue + 1;

        return {
          command: command(),
          label: `Increment to ${afterValue}`,
          before: state(String(beforeValue)),
          after: state(String(afterValue)),
          apply: () => {
            value = afterValue;
          },
          rollback: () => {
            value = beforeValue;
          },
        };
      });

    const first = queueMutation();
    const second = queueMutation();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);

    expect(observedBefore).toEqual([0, 1]);
    expect(value).toBe(2);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(2);
  });

  it('does not apply anything when a lazy mutation factory throws', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'sha256:one',
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    await expect(
      commitDurableStateMutation(() => {
        throw new Error('factory failed');
      }),
    ).rejects.toThrow(/factory failed/);

    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
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

  it('rejects a factory queued before reopening the same bytes, before deriving state', async () => {
    const open = () => useSessionStore.getState().openDocument({
      documentKey: 'sha256:one', fileName: 'same.pdf',
      bytes: Uint8Array.from([1]), pageCount: 1,
    });
    open();
    let release!: () => void;
    const blocker = enqueueDocumentOperation(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const factory = vi.fn(() => null);
    const pending = commitDurableStateMutation(factory);
    const result = expect(pending).rejects.toBeInstanceOf(StaleDurableStateMutationError);
    open();
    release();
    await blocker;
    await result;
    expect(factory).not.toHaveBeenCalled();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('rejects an async factory after a document switch without applying', async () => {
    await openJournalAwareSession();
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const apply = vi.fn();
    const factory = vi.fn(async () => {
      await barrier;
      return { command: command(), label: 'Stale', before: state(''), after: state('after'), apply, rollback: vi.fn() };
    });
    const pending = commitDurableStateMutation(factory);
    const result = expect(pending).rejects.toBeInstanceOf(StaleDurableStateMutationError);
    await Promise.resolve();
    expect(factory).toHaveBeenCalledOnce();
    useSessionStore.getState().openDocument({ documentKey: 'sha256:two', fileName: 'B.pdf', bytes: Uint8Array.from([2]), pageCount: 1 });
    release();
    await result;
    expect(apply).not.toHaveBeenCalled();
    expect(useSessionStore.getState().documentKey).toBe('sha256:two');
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('does not restore old session or rollback old state after a late journal failure', async () => {
    const journal = await openJournalAwareSession();
    let rejectSave!: (error: Error) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    vi.spyOn(journal, 'save').mockImplementationOnce(() => {
      signalStarted();
      return new Promise<void>((_, reject) => { rejectSave = reject; });
    });
    const rollback = vi.fn();
    const pending = commitDurableStateTransaction({
      command: command(), label: 'A', before: state(''), after: state('after'),
      apply: () => useSessionStore.getState().setDirty(true), rollback,
    });
    const result = expect(pending).rejects.toBeInstanceOf(StaleDurableStateMutationError);
    await started;
    useSessionStore.getState().openDocument({ documentKey: 'sha256:two', fileName: 'B.pdf', bytes: Uint8Array.from([2]), pageCount: 1 });
    useHistoryStore.getState().clear();
    rejectSave(new Error('late A write failure'));
    await result;
    expect(rollback).not.toHaveBeenCalled();
    expect(useSessionStore.getState().documentKey).toBe('sha256:two');
    expect(useSessionStore.getState().isDirty).toBe(false);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
