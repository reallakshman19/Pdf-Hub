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
});
