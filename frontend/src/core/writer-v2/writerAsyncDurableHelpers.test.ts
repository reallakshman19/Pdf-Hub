import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import {
  createInitialHistoryJournalManifest,
} from '@/core/document-history/journal/types';
import { useHistoryStore } from '@/core/document-history/store';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import { useSessionStore } from '@/core/session/store';
import {
  createPdfOverlayWriterDocumentMeta,
} from './writerDocumentMode';
import {
  patchActiveRichBoxStyle,
} from './writerRichBoxStyleActions';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';

function element(): WriterElementV2 {
  return {
    id: 'writer-1',
    documentFingerprint: 'sha256:one',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 180,
      height: 90,
    },
    plainText: 'Rich box',
    editorStateJson:
      '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt:
      '2026-09-19T00:00:00.000Z',
    updatedAt:
      '2026-09-19T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('async Writer helpers durable history', () => {
  beforeEach(() => {
    resetDocumentOperationQueueForTests();
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
  });

  it('persists rich-box style helper changes through the durable Writer path', async () => {
    const revisions = new MemoryRevisionStore({
      id: 'writer-helper-revisions',
    });
    registerWorkingRevisionStore(revisions);

    const journal = new MemoryHistoryJournalStore({
      id: 'writer-helper-journal',
    });
    registerHistoryJournalStore(journal);

    await journal.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-writer-helper',
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
      historyJournalId:
        'history-writer-helper',
      historyJournalPersistent: false,
      fileName: 'fixture.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'page-1',
          documentKey: 'sha256:one',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    useWriterV2Store
      .getState()
      .hydrateWriterSession({
        documentFingerprint: 'sha256:one',
        elements: [element()],
        documentMeta:
          createPdfOverlayWriterDocumentMeta({
            documentFingerprint:
              'sha256:one',
            pageCount: 1,
            now:
              '2026-09-19T00:00:00.000Z',
          }),
      });
    useWriterV2Store
      .getState()
      .dispatchWriterCommand({
        type: 'SET_ACTIVE_WRITER_ELEMENT',
        id: 'writer-1',
      });

    const result =
      await patchActiveRichBoxStyle({
        backgroundColor: '#eff6ff',
        padding: 14,
      });

    expect(result.changed).toBe(true);
    expect(
      useWriterV2Store
        .getState()
        .elements[0]
        .style,
    ).toMatchObject({
      backgroundColor: '#eff6ff',
      padding: 14,
    });

    const transaction =
      useHistoryStore.getState().undoStack.at(-1);
    expect(transaction?.command.type).toBe(
      'WRITER_CHANGE',
    );

    await expect(
      journal.load('history-writer-helper'),
    ).resolves.toMatchObject({
      activeTransactionId: transaction?.id,
      entries: [{
        transactionId: transaction?.id,
        command: {
          type: 'WRITER_CHANGE',
        },
      }],
      checkpoints: [
        { kind: 'ADMISSION' },
        {
          kind: 'BARRIER',
          transactionId: transaction?.id,
          statePayload: {
            writer: {
              elements: [{
                id: 'writer-1',
                style: {
                  backgroundColor:
                    '#eff6ff',
                  padding: 14,
                },
              }],
            },
          },
        },
      ],
    });
  });
});
