import { beforeEach, describe, it, expect } from 'vitest';
import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import {
  clearDocumentSourceRegistryForTests,
  registerDocumentSource,
  resolveDocumentSource,
} from '@/core/document-source/registry';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
  resolveHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import { useSessionStore } from '../store';

function graph(ids: string[], documentKey = 'doc-nav') {
  return {
    pages: ids.map((pageId, index) => ({
      pageId,
      documentKey,
      originalPageNumber: index + 1,
      currentIndex: index,
      width: 595,
      height: 842,
      rotation: 0 as const,
    })),
  };
}

describe('Session Store', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    clearDocumentSourceRegistryForTests();
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
  });
  it('tracks dirty states and save actions', () => {
    const store = useSessionStore.getState();
    store.openDocument({
      documentKey: 'doc1',
      fileName: 'doc1.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });

    expect(useSessionStore.getState().isDocumentDirty).toBe(false);
    expect(useSessionStore.getState().isReviewDirty).toBe(false);
    expect(useSessionStore.getState().isSessionDirty).toBe(false);

    useSessionStore.getState().setDocumentDirty(true);
    expect(useSessionStore.getState().isDocumentDirty).toBe(true);

    useSessionStore.getState().recordSaveExportAction(
      { type: 'SAVE_WORKING_DOCUMENT' },
      'success',
      'Saved',
    );
    expect(useSessionStore.getState().lastExportAction?.type).toBe('SAVE_WORKING_DOCUMENT');
    expect(useSessionStore.getState().lastOperation?.status).toBe('success');
  });

  it('records failed save/export metadata', () => {
    useSessionStore.getState().recordSaveExportAction(
      { type: 'EXPORT_REVIEW_SNAPSHOT' },
      'failure',
      'Export failed',
    );

    expect(useSessionStore.getState().lastExportAction?.type).toBe('EXPORT_REVIEW_SNAPSHOT');
    expect(useSessionStore.getState().lastOperation?.status).toBe('failure');
    expect(useSessionStore.getState().lastOperation?.message).toBe('Export failed');
  });

  it('replaces working copy and keeps current page in range', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc2',
      fileName: 'doc2.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 5,
    });
    useSessionStore.getState().setPage(5);
    useSessionStore.getState().replaceWorkingCopy(new Uint8Array([3, 2, 1]), 2);

    expect(useSessionStore.getState().pageCount).toBe(2);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);
    expect(useSessionStore.getState().isDocumentDirty).toBe(true);
  });

  it('toggles selected pages without duplicates', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc3',
      fileName: 'doc3.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 5,
    });

    useSessionStore.getState().toggleSelectedPage(2);
    useSessionStore.getState().toggleSelectedPage(4);
    useSessionStore.getState().toggleSelectedPage(2);

    expect(useSessionStore.getState().selectedPages).toEqual([4]);
  });

  it('stores document bytes by reference (copy-on-write), not by copy', () => {
    const openedBytes = new Uint8Array([1, 2, 3]);
    useSessionStore.getState().openDocument({
      documentKey: 'doc4',
      fileName: 'doc4.pdf',
      bytes: openedBytes,
      pageCount: 1,
    });

    expect(useSessionStore.getState().originalBytes).toBe(openedBytes);
    expect(useSessionStore.getState().workingBytes).toBe(openedBytes);

    const replacedBytes = new Uint8Array([4, 5]);
    useSessionStore.getState().replaceWorkingCopy(replacedBytes, 1);
    expect(useSessionStore.getState().workingBytes).toBe(replacedBytes);

    const committedBytes = new Uint8Array([6, 7, 8]);
    useSessionStore.getState().commitWorkingCopy({ bytes: committedBytes, pageCount: 1 });
    expect(useSessionStore.getState().originalBytes).toBe(committedBytes);
    expect(useSessionStore.getState().workingBytes).toBe(committedBytes);
  });

  it('stores a real PageGraph on open and clears it with the document', () => {
    const pageGraph = {
      pages: [{
        pageId: 'doc-page-1',
        documentKey: 'doc-graph',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0 as const,
      }],
    };

    useSessionStore.getState().openDocument({
      documentKey: 'doc-graph',
      fileName: 'graph.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph,
    });

    expect(useSessionStore.getState().pageGraph).toEqual(pageGraph);

    useSessionStore.getState().clearDocument();

    expect(useSessionStore.getState().pageGraph).toBeNull();
    expect(useSessionStore.getState().pageCount).toBe(0);
  });

  it('invalidates PageGraph on legacy working-copy mutation until structural commands become graph-aware', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-graph',
      fileName: 'graph.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'doc-graph',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    useSessionStore.getState().replaceWorkingCopy(new Uint8Array([2]), 1);

    expect(useSessionStore.getState().pageGraph).toBeNull();
  });

  it('preserves PageId and rekeys PageGraph metadata on non-structural committed save', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-before',
      fileName: 'graph.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-page',
          documentKey: 'doc-before',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });

    useSessionStore.getState().commitWorkingCopy({
      bytes: new Uint8Array([2]),
      pageCount: 1,
      documentKey: 'doc-after',
    });

    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'stable-page',
      documentKey: 'doc-after',
    });
  });

  it('rejects an opening payload whose PageGraph count disagrees with pageCount', () => {
    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'doc-invalid',
        fileName: 'invalid.pdf',
        bytes: new Uint8Array([1]),
        pageCount: 2,
        pageGraph: {
          pages: [{
            pageId: 'only-page',
            documentKey: 'doc-invalid',
            originalPageNumber: 1,
            currentIndex: 0,
            width: 595,
            height: 842,
            rotation: 0,
          }],
        },
      }),
    ).toThrow(/PageGraph count 1 does not match pageCount 2/);
  });


  it('derives current PageId from numeric navigation and resolves PageId back to page number', () => {
    const pageGraph = graph(['p1', 'p2', 'p3']);
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph,
    });

    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p1',
      currentPage: 1,
    });

    useSessionStore.getState().setPage(3);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p3',
      currentPage: 3,
    });

    useSessionStore.getState().setPageById('p2');
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p2',
      currentPage: 2,
    });
  });

  it('derives selected PageIds from page numbers and page numbers from PageIds', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph: graph(['p1', 'p2', 'p3']),
    });

    useSessionStore.getState().setSelectedPages([3, 1]);
    expect(useSessionStore.getState().selectedPageIds).toEqual(['p1', 'p3']);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 3]);

    useSessionStore.getState().setSelectedPageIds(['p2', 'p1']);
    expect(useSessionStore.getState().selectedPageIds).toEqual(['p1', 'p2']);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 2]);
  });

  it('keeps current and selected identity stable when PageGraph order changes', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph: graph(['p1', 'p2', 'p3']),
    });
    useSessionStore.getState().setPageById('p1');
    useSessionStore.getState().setSelectedPageIds(['p1', 'p3']);

    useSessionStore.getState().setPageGraph(graph(['p3', 'p2', 'p1']));

    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p1',
      currentPage: 3,
    });
    expect(useSessionStore.getState().selectedPageIds).toEqual(['p3', 'p1']);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 3]);
  });

  it('drops deleted selected IDs and falls current page back to the old physical position', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph: graph(['p1', 'p2', 'p3']),
    });
    useSessionStore.getState().setPageById('p2');
    useSessionStore.getState().setSelectedPageIds(['p2', 'p3']);

    useSessionStore.getState().setPageGraph(graph(['p1', 'p3']));

    expect(useSessionStore.getState().selectedPageIds).toEqual(['p3']);
    expect(useSessionStore.getState().selectedPages).toEqual([2]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p3',
      currentPage: 2,
    });
  });

  it('retains canonical navigation IDs while PageGraph is temporarily invalidated', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph: graph(['p1', 'p2', 'p3']),
    });
    useSessionStore.getState().setPageById('p2');
    useSessionStore.getState().setSelectedPageIds(['p2']);

    useSessionStore.getState().replaceWorkingCopy(new Uint8Array([2]), 3);

    expect(useSessionStore.getState().pageGraph).toBeNull();
    expect(useSessionStore.getState().selectedPageIds).toEqual(['p2']);
    expect(useSessionStore.getState().viewState.currentPageId).toBe('p2');

    useSessionStore.getState().setPageGraph(graph(['p3', 'p2', 'p1']));

    expect(useSessionStore.getState().selectedPages).toEqual([2]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p2',
      currentPage: 2,
    });
  });

  it('preserves navigation PageIds across a non-structural committed save', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-before',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
      pageGraph: graph(['p1', 'p2', 'p3'], 'doc-before'),
    });
    useSessionStore.getState().setPageById('p3');
    useSessionStore.getState().setSelectedPageIds(['p1', 'p3']);

    useSessionStore.getState().commitWorkingCopy({
      bytes: new Uint8Array([2]),
      pageCount: 3,
      documentKey: 'doc-after',
    });

    expect(useSessionStore.getState().selectedPageIds).toEqual(['p1', 'p3']);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 3]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'p3',
      currentPage: 3,
    });
  });

  it('hydrates canonical IDs when a legacy numeric session receives its PageGraph', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'legacy-nav',
      fileName: 'legacy.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 3,
    });
    useSessionStore.getState().setPage(2);
    useSessionStore.getState().setSelectedPages([1, 3]);

    useSessionStore.getState().setPageGraph(graph(['p1', 'p2', 'p3'], 'legacy-nav'));

    expect(useSessionStore.getState().viewState.currentPageId).toBe('p2');
    expect(useSessionStore.getState().selectedPageIds).toEqual(['p1', 'p3']);
  });

  it('clears canonical navigation IDs with the document', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-nav',
      fileName: 'nav.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 2,
      pageGraph: graph(['p1', 'p2']),
    });
    useSessionStore.getState().setPageById('p2');
    useSessionStore.getState().setSelectedPageIds(['p2']);

    useSessionStore.getState().clearDocument();

    expect(useSessionStore.getState().selectedPageIds).toEqual([]);
    expect(useSessionStore.getState().viewState.currentPageId).toBeNull();
  });


  it('tracks registered immutable revision identity across working-copy changes', () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'session-revisions',
    });
    registerWorkingRevisionStore(revisionStore);

    useSessionStore.getState().openDocument({
      documentKey: 'sha256:initial',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'sha256:initial',
      activeRevisionId: 'sha256:initial',
      fileName: 'revision-aware.pdf',
      bytes: Uint8Array.from([1, 2, 3]),
      pageCount: 1,
    });

    expect(useSessionStore.getState()).toMatchObject({
      revisionStoreId: 'session-revisions',
      originalRevisionId: 'sha256:initial',
      activeRevisionId: 'sha256:initial',
    });

    useSessionStore.getState().replaceWorkingCopy(
      Uint8Array.from([4, 5, 6]),
      1,
    );

    expect(useSessionStore.getState()).toMatchObject({
      originalRevisionId: 'sha256:initial',
      activeRevisionId: null,
    });

    useSessionStore.getState().commitWorkingCopy({
      bytes: Uint8Array.from([7, 8, 9]),
      pageCount: 1,
      documentKey: 'sha256:saved',
      activeRevisionId: 'sha256:saved',
    });

    expect(useSessionStore.getState()).toMatchObject({
      documentKey: 'sha256:saved',
      originalRevisionId: 'sha256:initial',
      activeRevisionId: 'sha256:saved',
    });
  });

  it('rejects incomplete, unregistered or stale revision metadata', () => {
    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'sha256:one',
        revisionStoreId: 'missing-store',
        originalRevisionId: 'sha256:one',
        activeRevisionId: 'sha256:one',
        fileName: 'missing.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/revisionStoreId .* not registered/);

    const revisionStore = new MemoryRevisionStore({
      id: 'registered-store',
    });
    registerWorkingRevisionStore(revisionStore);

    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'sha256:one',
        revisionStoreId: revisionStore.id,
        originalRevisionId: 'sha256:one',
        fileName: 'partial.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/must provide revisionStoreId, originalRevisionId and activeRevisionId together/);

    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'sha256:one',
        revisionStoreId: revisionStore.id,
        originalRevisionId: 'sha256:one',
        activeRevisionId: 'sha256:other',
        fileName: 'stale.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/activeRevisionId .* must match documentKey/);
  });

  it('releases the process-local revision store reference on clear', () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'clear-revisions',
    });
    registerWorkingRevisionStore(revisionStore);

    useSessionStore.getState().openDocument({
      documentKey: 'sha256:clear',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'sha256:clear',
      activeRevisionId: 'sha256:clear',
      fileName: 'clear.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    expect(
      resolveWorkingRevisionStore(revisionStore.id),
    ).toBe(revisionStore);

    useSessionStore.getState().clearDocument();

    expect(useSessionStore.getState()).toMatchObject({
      revisionStoreId: null,
      originalRevisionId: null,
      activeRevisionId: null,
    });
    expect(
      resolveWorkingRevisionStore(revisionStore.id),
    ).toBeNull();
  });

  it('tracks and releases history journal identity with the document', () => {
    const journalStore = new MemoryHistoryJournalStore({
      id: 'session-history-journals',
    });
    registerHistoryJournalStore(journalStore);

    useSessionStore.getState().openDocument({
      documentKey: 'doc-journal',
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-session-1',
      historyJournalPersistent: false,
      fileName: 'journal.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });

    expect(useSessionStore.getState()).toMatchObject({
      historyJournalStoreId: journalStore.id,
      historyJournalId: 'history-session-1',
      historyJournalPersistent: false,
    });
    expect(
      resolveHistoryJournalStore(journalStore.id),
    ).toBe(journalStore);

    useSessionStore.getState().clearDocument();

    expect(useSessionStore.getState()).toMatchObject({
      historyJournalStoreId: null,
      historyJournalId: null,
      historyJournalPersistent: false,
    });
    expect(
      resolveHistoryJournalStore(journalStore.id),
    ).toBeNull();
  });

  it('rejects incomplete or unregistered history journal metadata', () => {
    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'doc-journal',
        historyJournalStoreId: 'missing-journal-store',
        historyJournalId: 'history-missing',
        fileName: 'missing-journal.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/historyJournalStoreId .* not registered/);

    const journalStore = new MemoryHistoryJournalStore({
      id: 'registered-journal-store',
    });
    registerHistoryJournalStore(journalStore);

    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'doc-journal',
        historyJournalStoreId: journalStore.id,
        fileName: 'partial-journal.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/historyJournalStoreId and historyJournalId must be provided together/);

    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'doc-journal',
        historyJournalPersistent: true,
        fileName: 'false-persistent.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/cannot mark history journal persistent/);
  });


  it('retains only sourceId in session state and releases it on clear', () => {
    const source = new MemorySource({
      id: 'source:session',
      bytes: Uint8Array.from([1, 2, 3]),
    });
    registerDocumentSource(source);

    useSessionStore.getState().openDocument({
      documentKey: 'doc-source',
      sourceId: source.id,
      fileName: 'source.pdf',
      bytes: Uint8Array.from([1, 2, 3]),
      pageCount: 1,
    });

    expect(useSessionStore.getState().sourceId).toBe(
      'source:session',
    );
    expect(
      resolveDocumentSource('source:session'),
    ).toBe(source);

    useSessionStore.getState().replaceWorkingCopy(
      Uint8Array.from([4, 5]),
      1,
    );
    expect(useSessionStore.getState().sourceId).toBe(
      'source:session',
    );

    useSessionStore.getState().commitWorkingCopy({
      bytes: Uint8Array.from([6, 7]),
      pageCount: 1,
      documentKey: 'doc-source-saved',
    });
    expect(useSessionStore.getState().sourceId).toBe(
      'source:session',
    );
    expect(
      resolveDocumentSource('source:session'),
    ).toBe(source);

    useSessionStore.getState().clearDocument();
    expect(useSessionStore.getState().sourceId).toBeNull();
    expect(
      resolveDocumentSource('source:session'),
    ).toBeNull();
  });

  it('releases the prior source when a different document opens', () => {
    const first = new MemorySource({
      id: 'source:first',
      bytes: Uint8Array.from([1]),
    });
    const second = new MemorySource({
      id: 'source:second',
      bytes: Uint8Array.from([2]),
    });
    registerDocumentSource(first);
    registerDocumentSource(second);

    useSessionStore.getState().openDocument({
      documentKey: 'doc-first',
      sourceId: first.id,
      fileName: 'first.pdf',
      bytes: Uint8Array.from([1]),
      pageCount: 1,
    });
    useSessionStore.getState().openDocument({
      documentKey: 'doc-second',
      sourceId: second.id,
      fileName: 'second.pdf',
      bytes: Uint8Array.from([2]),
      pageCount: 1,
    });

    expect(resolveDocumentSource(first.id)).toBeNull();
    expect(resolveDocumentSource(second.id)).toBe(second);
    expect(useSessionStore.getState().sourceId).toBe(
      second.id,
    );
  });

  it('rejects an unregistered sourceId on open', () => {
    expect(() =>
      useSessionStore.getState().openDocument({
        documentKey: 'doc-missing-source',
        sourceId: 'source:missing',
        fileName: 'missing.pdf',
        bytes: Uint8Array.from([1]),
        pageCount: 1,
      }),
    ).toThrow(/not registered/);
  });

});
