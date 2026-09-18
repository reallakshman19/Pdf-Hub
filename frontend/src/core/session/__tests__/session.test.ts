import { describe, it, expect } from 'vitest';
import { useSessionStore } from '../store';

describe('Session Store', () => {
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

});
