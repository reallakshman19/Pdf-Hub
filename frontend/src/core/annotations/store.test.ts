import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationStore } from './store';
import { useSessionStore } from '../session/store';
import { useHistoryStore } from '../document-history/store';
import type { PdfAnnotation } from './types';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '../revision-store/registry';

const baseAnnotation = (id: string, pageNumber: number, x: number, y: number): PdfAnnotation => ({
  id,
  type: 'textbox',
  pageNumber,
  rect: { x, y, width: 100, height: 40 },
  data: {},
  createdAt: 1,
  updatedAt: 1,
});

describe('annotation store', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      annotations: [],
      activeAnnotationId: null,
      selectedAnnotationIds: [],
      clipboard: [],
    });
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    clearWorkingRevisionStoreRegistryForTests();
  });

  it('add/update/delete manage selection state', () => {
    const store = useAnnotationStore.getState();

    store.addAnnotation(baseAnnotation('a1', 1, 10, 20));
    store.addAnnotation(baseAnnotation('a2', 1, 30, 40));

    let state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(2);
    expect(state.selectedAnnotationIds).toEqual(['a2']);
    expect(state.activeAnnotationId).toBe('a2');

    store.updateAnnotation('a2', { rect: { x: 111, y: 222, width: 88, height: 55 } });
    state = useAnnotationStore.getState();
    expect(state.annotations.find((a) => a.id === 'a2')?.rect).toEqual({
      x: 111, y: 222, width: 88, height: 55,
    });

    store.deleteAnnotation('a2');
    state = useAnnotationStore.getState();
    expect(state.annotations.map((a) => a.id)).toEqual(['a1']);
    expect(state.activeAnnotationId).toBeNull();
    expect(state.selectedAnnotationIds).toEqual([]);
  });

  it('keeps native rich-text semantics read-only while allowing safe geometry and border edits', () => {
    const rich: PdfAnnotation = {
      ...baseAnnotation('rich-1', 1, 10, 20),
      data: {
        text: 'Rich baseline',
        fontSize: 12,
        textColor: '#112233',
        textAlign: 'left',
        nativeInterop: {
          fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
          reason: 'RICH_TEXT',
          richText: true,
          defaultStyle: true,
          protectedSnapshot: {
            type: 'textbox',
            text: 'Rich baseline',
            fontSize: 12,
            textColor: '#112233',
            textAlign: 'left',
          },
        },
      },
    };

    const store = useAnnotationStore.getState();
    store.setAnnotations([rich]);
    store.setSelection(['rich-1']);

    const before = useAnnotationStore.getState().annotations[0];

    store.updateAnnotation('rich-1', {
      type: 'callout',
      data: {
        ...before.data,
        text: 'Blocked plain-text edit',
        fontSize: 24,
        textColor: '#ff0000',
      },
    });

    let current = useAnnotationStore.getState().annotations[0];
    expect(current).toBe(before);
    expect(current.type).toBe('textbox');
    expect(current.data.text).toBe('Rich baseline');
    expect(current.data.fontSize).toBe(12);
    expect(current.data.textColor).toBe('#112233');
    expect(current.updatedAt).toBe(1);

    store.updateAnnotation('rich-1', {
      rect: { x: 30, y: 40, width: 120, height: 50 },
    });

    current = useAnnotationStore.getState().annotations[0];
    expect(current.rect).toEqual({ x: 30, y: 40, width: 120, height: 50 });
    expect(current.data.text).toBe('Rich baseline');

    store.updateStyleForSelection({
      fontSize: 30,
      textColor: '#ff0000',
      stroke: '#00ff00',
    });

    current = useAnnotationStore.getState().annotations[0];
    expect(current.data.fontSize).toBe(12);
    expect(current.data.textColor).toBe('#112233');
    expect(current.data.borderColor).toBe('#00ff00');
  });

  it('setSelection normalizes unknown/duplicate ids and sets active id', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([baseAnnotation('a1', 1, 0, 0), baseAnnotation('a2', 1, 0, 0)]);

    store.setSelection(['a2', 'missing', 'a2', 'a1']);
    const state = useAnnotationStore.getState();
    expect(state.selectedAnnotationIds).toEqual(['a2', 'a1']);
    expect(state.activeAnnotationId).toBe('a2');
  });

  it('updateManyAnnotations only patches targeted records', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      baseAnnotation('a1', 1, 10, 10),
      baseAnnotation('a2', 2, 20, 20),
      baseAnnotation('a3', 3, 30, 30),
    ]);

    store.updateManyAnnotations([
      { id: 'a1', data: { pageNumber: 5 } },
      {
        id: 'a3',
        data: {
          data: {
            review: {
              author: 'Reviewer',
              createdAt: 1,
              updatedAt: 1,
              status: 'resolved',
              replies: [],
            },
          },
        },
      },
    ]);

    const state = useAnnotationStore.getState();
    expect(state.annotations.find((a) => a.id === 'a1')?.pageNumber).toBe(5);
    expect(state.annotations.find((a) => a.id === 'a2')?.pageNumber).toBe(2);
    expect(state.annotations.find((a) => a.id === 'a3')?.data.review?.status).toBe('resolved');
  });

  it('setReviewStatusForSelection writes only canonical review metadata', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([baseAnnotation('a1', 1, 10, 10)]);
    store.setSelection(['a1']);

    store.setReviewStatusForSelection('resolved');

    const annotation = useAnnotationStore.getState().annotations[0];
    expect(annotation.data.review?.status).toBe('resolved');
    expect(annotation.data.review?.replies).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(annotation.data, 'reviewStatus')).toBe(false);
  });

  it('focused review actions update one annotation and append trimmed replies', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      baseAnnotation('a1', 1, 10, 10),
      baseAnnotation('a2', 1, 20, 20),
    ]);

    store.setReviewStatus('a1', 'resolved');
    store.addReviewReply('a1', '  Confirmed against source.  ', 'Reviewer');

    const state = useAnnotationStore.getState();
    const first = state.annotations.find((annotation) => annotation.id === 'a1');
    const second = state.annotations.find((annotation) => annotation.id === 'a2');

    expect(first?.data.review?.status).toBe('resolved');
    expect(first?.data.review?.replies).toHaveLength(1);
    expect(first?.data.review?.replies[0]).toMatchObject({
      author: 'Reviewer',
      content: 'Confirmed against source.',
    });
    expect(second?.data.review).toBeUndefined();
  });

  it('copySelection + pasteClipboard clones and offsets geometry including callout points', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      {
        ...baseAnnotation('callout-1', 2, 50, 70),
        type: 'callout',
        data: {
          anchor: { x: 20, y: 30 },
          knee: { x: 45, y: 60 },
        },
      },
    ]);
    store.setSelection(['callout-1']);
    store.copySelection();
    store.pasteClipboard(4);

    const state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(2);
    const pasted = state.annotations.find((a) => a.id !== 'callout-1');
    expect(pasted?.pageNumber).toBe(4);
    expect(pasted?.rect.x).toBe(68);
    expect(pasted?.rect.y).toBe(88);
    expect(pasted?.data.anchor).toEqual({ x: 38, y: 48 });
    expect(pasted?.data.knee).toEqual({ x: 63, y: 78 });
    expect(pasted?.createdAt).toBe(1700000000000);
    expect(state.selectedAnnotationIds).toEqual([pasted?.id]);
    nowSpy.mockRestore();
  });

  it('alignSelection ignores locked annotations and moves unlocked records', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      { ...baseAnnotation('a1', 1, 10, 10), data: { locked: true } },
      baseAnnotation('a2', 1, 100, 40),
      baseAnnotation('a3', 1, 200, 70),
    ]);
    store.setSelection(['a1', 'a2', 'a3']);

    store.alignSelection('left');
    const state = useAnnotationStore.getState();
    expect(state.annotations.find((a) => a.id === 'a1')?.rect.x).toBe(10);
    expect(state.annotations.find((a) => a.id === 'a2')?.rect.x).toBe(10);
    expect(state.annotations.find((a) => a.id === 'a3')?.rect.x).toBe(10);
  });

  it('records revision-aware annotation mutations without retaining PDF bytes', () => {
    const revisionStore = new MemoryRevisionStore({
      id: 'annotation-history-revisions',
    });
    registerWorkingRevisionStore(revisionStore);

    useSessionStore.getState().openDocument({
      documentKey: 'doc-annotations',
      revisionStoreId: revisionStore.id,
      originalRevisionId: 'doc-annotations',
      activeRevisionId: 'doc-annotations',
      fileName: 'annotations.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });

    useAnnotationStore.getState().addAnnotation(baseAnnotation('history-a1', 1, 10, 20));

    const history = useHistoryStore.getState();
    expect(history.undoStack).toHaveLength(1);
    expect(history.undoStack[0]?.command.type).toBe('ANNOTATION_CHANGE');
    expect(history.undoStack[0]?.before.revision).toEqual({
      storeId: revisionStore.id,
      revisionId: 'doc-annotations',
    });
    expect(history.undoStack[0]?.after.revision).toEqual({
      storeId: revisionStore.id,
      revisionId: 'doc-annotations',
    });
    expect(history.undoStack[0]?.before.bytes).toBeUndefined();
    expect(history.undoStack[0]?.after.bytes).toBeUndefined();
    expect(history.retainedBytes).toBe(0);
    expect(history.undoStack[0]?.after.annotations.map((annotation) => annotation.id)).toEqual([
      'history-a1',
    ]);
  });


  it('upgrades legacy pageNumber annotations to PageId when a PageGraph session is active', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-anchors',
      fileName: 'anchors.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 2,
      pageGraph: {
        pages: [
          {
            pageId: 'page-a',
            documentKey: 'doc-anchors',
            originalPageNumber: 1,
            currentIndex: 0,
            width: 595,
            height: 842,
            rotation: 0,
          },
          {
            pageId: 'page-b',
            documentKey: 'doc-anchors',
            originalPageNumber: 2,
            currentIndex: 1,
            width: 595,
            height: 842,
            rotation: 0,
          },
        ],
      },
    });

    useAnnotationStore.getState().setAnnotations([
      baseAnnotation('legacy', 2, 10, 20),
    ]);

    expect(useAnnotationStore.getState().annotations[0]).toMatchObject({
      id: 'legacy',
      pageId: 'page-b',
      pageNumber: 2,
    });
  });

  it('retargets pasted annotations to the destination PageId', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-paste',
      fileName: 'paste.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 2,
      pageGraph: {
        pages: [
          {
            pageId: 'page-1',
            documentKey: 'doc-paste',
            originalPageNumber: 1,
            currentIndex: 0,
            width: 595,
            height: 842,
            rotation: 0,
          },
          {
            pageId: 'page-2',
            documentKey: 'doc-paste',
            originalPageNumber: 2,
            currentIndex: 1,
            width: 595,
            height: 842,
            rotation: 0,
          },
        ],
      },
    });

    const store = useAnnotationStore.getState();
    store.setAnnotations([baseAnnotation('copy-me', 1, 10, 20)]);
    store.setSelection(['copy-me']);
    store.copySelection();
    store.pasteClipboard(2);

    const pasted = useAnnotationStore.getState().annotations.find(
      (annotation) => annotation.id !== 'copy-me',
    );
    expect(pasted).toMatchObject({
      pageId: 'page-2',
      pageNumber: 2,
    });
  });

});
