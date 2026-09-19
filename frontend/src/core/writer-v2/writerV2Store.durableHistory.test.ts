import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
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
  createMemoryWriterPersistence,
  type WriterAssetRecordV2,
} from './persistence/indexedDbWriterStore';
import {
  resetWriterPersistenceAdapterForTests,
  setWriterPersistenceAdapterForTests,
} from './persistence/writerPersistenceRuntime';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'sha256:one',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    },
    editorStateJson:
      '{"root":{"children":[]}}',
    plainText: id,
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

describe('Writer V2 durable command dispatch', () => {
  beforeEach(() => {
    resetDocumentOperationQueueForTests();
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
    resetWriterPersistenceAdapterForTests();
  });

  async function openJournalAwareWriterSession() {
    const revisions = new MemoryRevisionStore({
      id: 'writer-durable-revisions',
    });
    registerWorkingRevisionStore(revisions);

    const journal = new MemoryHistoryJournalStore({
      id: 'writer-durable-journal',
    });
    registerHistoryJournalStore(journal);

    await journal.save(
      createInitialHistoryJournalManifest({
        journalId: 'history-writer',
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
      historyJournalId: 'history-writer',
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

    const meta =
      createPdfOverlayWriterDocumentMeta({
        documentFingerprint: 'sha256:one',
        pageCount: 1,
        now: '2026-09-19T00:00:00.000Z',
      });

    useWriterV2Store
      .getState()
      .hydrateWriterSession({
        documentFingerprint: 'sha256:one',
        elements: [],
        documentMeta: meta,
      });

    return journal;
  }

  it('returns the committed result and persists a Writer state checkpoint', async () => {
    const journal =
      await openJournalAwareWriterSession();

    const result = await useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable({
        type: 'ADD_WRITER_ELEMENT',
        element: element('writer-1'),
      });

    expect(result.changed).toBe(true);
    expect(result.state.elements).toHaveLength(1);
    expect(result.state.elements[0]).toMatchObject({
      id: 'writer-1',
      pageId: 'page-1',
    });

    const writer = useWriterV2Store.getState();
    expect(writer.elements).toEqual(
      result.state.elements,
    );
    expect(writer.undoStack).toEqual([]);
    expect(writer.redoStack).toEqual([]);
    expect(
      useSessionStore.getState().isDirty,
    ).toBe(true);

    const transaction =
      useHistoryStore.getState().undoStack.at(-1);
    expect(transaction?.command.type).toBe(
      'WRITER_CHANGE',
    );

    await expect(
      journal.load('history-writer'),
    ).resolves.toMatchObject({
      activeRevisionId: 'sha256:one',
      activeTransactionId: transaction?.id,
      entries: [{
        transactionId: transaction?.id,
        command: {
          type: 'WRITER_CHANGE',
        },
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
            writer: {
              elements: [{
                id: 'writer-1',
                pageId: 'page-1',
              }],
            },
          },
        },
      ],
    });
  });

  it('persists newly referenced Writer assets before the journal checkpoint', async () => {
    const journal =
      await openJournalAwareWriterSession();
    const persistence =
      createMemoryWriterPersistence();
    setWriterPersistenceAdapterForTests(
      persistence,
    );

    const events: string[] = [];
    const originalSaveAsset =
      persistence.saveAsset.bind(persistence);
    vi.spyOn(
      persistence,
      'saveAsset',
    ).mockImplementation(async (asset) => {
      events.push('asset');
      await originalSaveAsset(asset);
    });

    const originalJournalSave =
      journal.save.bind(journal);
    vi.spyOn(
      journal,
      'save',
    ).mockImplementation(async (manifest) => {
      if (manifest.entries.length > 0) {
        events.push('journal');
      }
      await originalJournalSave(manifest);
    });

    const asset: WriterAssetRecordV2 = {
      id: 'asset-1',
      documentFingerprint: 'sha256:one',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl:
        'data:image/png;base64,AAAA',
      width: 1,
      height: 1,
      createdAt:
        '2026-09-19T00:00:00.000Z',
      updatedAt:
        '2026-09-19T00:00:00.000Z',
    };
    useWriterV2Store
      .getState()
      .addWriterAssets([asset]);

    await expect(
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'ADD_WRITER_ELEMENT',
          element: {
            ...element('image-1'),
            type: 'imageBox',
            imageAssetId: 'asset-1',
            assetIds: ['asset-1'],
          },
        }),
    ).resolves.toMatchObject({
      changed: true,
    });

    expect(events).toEqual([
      'asset',
      'journal',
    ]);
    await expect(
      persistence.loadAsset('asset-1'),
    ).resolves.toMatchObject({
      id: 'asset-1',
      documentFingerprint: 'sha256:one',
    });
  });

  it('fails before Writer apply when a newly referenced asset record is missing', async () => {
    const journal =
      await openJournalAwareWriterSession();
    setWriterPersistenceAdapterForTests(
      createMemoryWriterPersistence(),
    );

    await expect(
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'ADD_WRITER_ELEMENT',
          element: {
            ...element('missing-image'),
            type: 'imageBox',
            imageAssetId: 'missing-asset',
            assetIds: ['missing-asset'],
          },
        }),
    ).rejects.toThrow(
      /cannot checkpoint missing asset/,
    );

    expect(
      useWriterV2Store.getState().elements,
    ).toEqual([]);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
    await expect(
      journal.load('history-writer'),
    ).resolves.toMatchObject({
      activeTransactionId: null,
      entries: [],
    });
  });

  it('serializes rapid durable Writer commands against committed state', async () => {
    const journal =
      await openJournalAwareWriterSession();

    const first = useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable({
        type: 'ADD_WRITER_ELEMENT',
        element: element('writer-1'),
      });
    const second = useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable({
        type: 'ADD_WRITER_ELEMENT',
        element: {
          ...element('writer-2'),
          style: {
            ...element('writer-2').style,
            zIndex: 2,
          },
        },
      });

    await expect(first).resolves.toMatchObject({
      changed: true,
    });
    await expect(second).resolves.toMatchObject({
      changed: true,
    });

    expect(
      useWriterV2Store
        .getState()
        .elements.map((item) => item.id),
    ).toEqual(['writer-1', 'writer-2']);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(2);

    const manifest =
      await journal.load('history-writer');
    expect(manifest?.entries).toHaveLength(2);
    expect(
      manifest?.checkpoints
        .filter((checkpoint) =>
          checkpoint.kind === 'BARRIER'
        )
        .at(-1)
        ?.statePayload
        ?.writer
        .elements
        .map((item) => item.id),
    ).toEqual(['writer-1', 'writer-2']);
  });

  it('rolls Writer and history state back when journal save fails', async () => {
    const journal =
      await openJournalAwareWriterSession();
    vi.spyOn(journal, 'save').mockRejectedValueOnce(
      new Error('journal write failed'),
    );

    await expect(
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'ADD_WRITER_ELEMENT',
          element: element('writer-1'),
        }),
    ).rejects.toThrow(/journal write failed/);

    expect(
      useWriterV2Store.getState().elements,
    ).toEqual([]);
    expect(
      useWriterV2Store.getState().dirty,
    ).toBe(false);
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);
    expect(
      useSessionStore.getState().isDirty,
    ).toBe(false);

    await expect(
      journal.load('history-writer'),
    ).resolves.toMatchObject({
      activeTransactionId: null,
      entries: [],
    });
  });

  it('does not require compatibility working bytes in a revision-backed session', async () => {
    await openJournalAwareWriterSession();

    useSessionStore.setState({
      workingBytes: null,
    });

    await expect(
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'ADD_WRITER_ELEMENT',
          element: element('writer-source-only'),
        }),
    ).resolves.toMatchObject({
      changed: true,
    });

    expect(
      useWriterV2Store
        .getState()
        .elements.map((item) => item.id),
    ).toEqual(['writer-source-only']);

    const undo = useWriterV2Store
      .getState()
      .undoWriter();
    expect(undo).toMatchObject({
      changed: false,
      reason:
        'PDF-backed Writer undo is owned by document history.',
    });
  });

  it('delegates selection commands and blank-document mutations to the synchronous store path', async () => {
    await openJournalAwareWriterSession();
    useWriterV2Store
      .getState()
      .hydrateWriterElements([
        element('writer-1'),
      ]);

    const selectionPromise =
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'SET_ACTIVE_WRITER_ELEMENT',
          id: 'writer-1',
        });

    expect(
      useWriterV2Store.getState().activeId,
    ).toBe('writer-1');
    await expect(selectionPromise).resolves.toMatchObject({
      changed: true,
    });
    expect(
      useHistoryStore.getState().undoStack,
    ).toHaveLength(0);

    useSessionStore.getState().clearDocument();
    const meta = useWriterV2Store
      .getState()
      .createBlankWriterDocument({
        documentFingerprint: 'blank-writer',
        pageCount: 1,
      });

    await expect(
      useWriterV2Store
        .getState()
        .dispatchWriterCommandDurable({
          type: 'ADD_WRITER_ELEMENT',
          element: {
            ...element('blank-1'),
            documentFingerprint:
              meta.documentFingerprint,
          },
        }),
    ).resolves.toMatchObject({
      changed: true,
    });

    expect(
      useWriterV2Store.getState().elements,
    ).toHaveLength(1);
    expect(
      useWriterV2Store.getState().undoStack.length,
    ).toBeGreaterThan(0);
  });
});
