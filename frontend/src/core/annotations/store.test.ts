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
      hydratedDocumentKey: null,
      nativeIntegrity: { status: 'LOADING', documentKey: null },
      nativeDeletionTombstones: [],
    });
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    clearWorkingRevisionStoreRegistryForTests();
  });


  it('records explicit, revision-matched native deletion commands rather than absence', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-integrity',
      fileName: 'integrity.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'page-original', documentKey: 'doc-integrity',
          originalPageNumber: 1, currentIndex: 0,
          width: 400, height: 500, rotation: 0,
        }],
      },
    });
    useAnnotationStore.setState({
      nativeIntegrity: { status: 'COMPLETE', documentKey: 'doc-integrity' },
      hydratedDocumentKey: 'doc-integrity',
    });
    const source: PdfAnnotation = {
      ...baseAnnotation('native-source', 1, 10, 20),
      data: { nativeSourceRef: '10 0 R', text: 'Original' },
    };
    useAnnotationStore.getState().setAnnotations([source]);
    useAnnotationStore.getState().deleteAnnotation('native-source');
    const state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(0);
    expect(state.nativeDeletionTombstones).toHaveLength(1);
    expect(state.nativeDeletionTombstones[0]).toMatchObject({
      sourceRevision: 'doc-integrity',
      sourceRef: '10 0 R',
      sourceName: 'native-source',
      pageId: 'page-original',
      pageNumber: 1,
      commandId: expect.any(String),
    });
  });

  it('refuses a native delete when source import integrity is not complete', () => {
    useSessionStore.setState({ documentKey: 'unsafe' });
    useAnnotationStore.setState({
      annotations: [{
        ...baseAnnotation('unsafe-native', 1, 10, 20),
        data: { nativeSourceRef: '10 0 R' },
      }],
      nativeIntegrity: { status: 'INCOMPLETE', documentKey: 'unsafe' },
    });
    useAnnotationStore.getState().deleteAnnotation('unsafe-native');
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useAnnotationStore.getState().nativeDeletionTombstones).toEqual([]);
  });

  it('records field-specific native edit provenance on user geometry/text changes', () => {
    useSessionStore.setState({ documentKey: 'doc-edit' });
    useAnnotationStore.getState().setAnnotations([{
      ...baseAnnotation('native-edited', 1, 10, 20),
      data: { nativeSourceRef: '21 0 R', text: 'Before' },
    }]);
    const source = useAnnotationStore.getState().annotations[0];
    useAnnotationStore.getState().updateAnnotation(source.id, {
      rect: { ...source.rect, x: 75 },
      data: { ...source.data, text: 'After' },
    });
    const updated = useAnnotationStore.getState().annotations[0];
    expect(updated.data.nativeEditProvenance).toMatchObject({
      sourceRevision: 'doc-edit',
      sourceRef: '21 0 R',
      fields: expect.arrayContaining(['rect', 'text']),
      commandId: expect.any(String),
    });
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

  it('anchors callout arrow pointer and keeps anchor stationary when callout rect moves', () => {
    const store = useAnnotationStore.getState();
    const callout: PdfAnnotation = {
      id: 'c1',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 200, y: 100, width: 120, height: 60 },
      data: {
        anchor: { x: 50, y: 50 },
        knee: { x: 100, y: 50 },
        text: 'Callout test',
      },
      createdAt: 1,
      updatedAt: 1,
    };
    store.addAnnotation(callout);

    // Update only the rect (e.g. moving the text box)
    store.updateAnnotation('c1', {
      rect: { x: 300, y: 150, width: 120, height: 60 },
    });

    const updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'c1');
    expect(updated?.rect).toEqual({ x: 300, y: 150, width: 120, height: 60 });
    // Anchor must NOT have shifted by dx=+100, dy=+50! It must remain anchored at 50, 50!
    expect(updated?.data.anchor).toEqual({ x: 50, y: 50 });
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

    const beforePage = current.pageNumber;
    store.updateAnnotation('rich-1', { pageNumber: 2 });
    expect(useAnnotationStore.getState().annotations[0].pageNumber).toBe(beforePage);

    store.copySelection();
    expect(useAnnotationStore.getState().clipboard).toHaveLength(1);

    store.duplicateSelection();
    expect(useAnnotationStore.getState().annotations).toHaveLength(2);
    const duplicated = useAnnotationStore.getState().annotations[1];
    expect(duplicated.id).not.toBe('rich-1');
    expect(duplicated.data.nativeInterop).toBeUndefined();
  });

  it('blocks cloning or structural reassignment when only a represented reply carries native rich text', () => {
    const thread: PdfAnnotation = {
      ...baseAnnotation('thread-rich-reply', 1, 10, 20),
      type: 'comment',
      data: {
        text: 'Plain root remains editable',
        review: {
          author: 'Reviewer',
          createdAt: 1,
          updatedAt: 1,
          status: 'open',
          replies: [
            {
              id: 'rich-reply',
              author: 'Reviewer Two',
              content: 'Native rich reply',
              createdAt: 1,
              nativeInterop: {
                fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
                reason: 'RICH_TEXT',
                richText: true,
                protectedContent: 'Native rich reply',
              },
            },
          ],
        },
      },
    };

    const store = useAnnotationStore.getState();
    store.setAnnotations([thread]);
    store.setSelection([thread.id]);

    store.updateAnnotation(thread.id, { type: 'textbox', pageNumber: 2 });
    let current = useAnnotationStore.getState().annotations[0];
    expect(current.type).toBe('comment');
    expect(current.pageNumber).toBe(1);

    store.updateAnnotation(thread.id, {
      data: { ...current.data, text: 'Plain root edit is still allowed' },
    });
    current = useAnnotationStore.getState().annotations[0];
    expect(current.data.text).toBe('Plain root edit is still allowed');

    const beforeReplyMutation = current;
    store.updateAnnotation(thread.id, {
      data: {
        ...current.data,
        review: {
          ...current.data.review!,
          replies: current.data.review!.replies.map((reply) =>
            reply.id === 'rich-reply'
              ? { ...reply, content: 'Blocked rich reply edit' }
              : reply),
        },
      },
    });
    current = useAnnotationStore.getState().annotations[0];
    expect(current).toBe(beforeReplyMutation);
    expect(current.data.review?.replies[0].content).toBe('Native rich reply');

    store.updateAnnotation(thread.id, {
      data: {
        ...current.data,
        review: {
          ...current.data.review!,
          replies: [],
        },
      },
    });
    current = useAnnotationStore.getState().annotations[0];
    expect(current.data.review?.replies).toHaveLength(1);
    expect(current.data.review?.replies[0].id).toBe('rich-reply');

    store.copySelection();
    expect(useAnnotationStore.getState().clipboard).toHaveLength(1);

    store.duplicateSelection();
    expect(useAnnotationStore.getState().annotations).toHaveLength(2);
    const threadDuplicated = useAnnotationStore.getState().annotations[1];
    expect(threadDuplicated.id).not.toBe('thread-rich-reply');
    expect(threadDuplicated.data.review?.replies[0].id).not.toBe('rich-reply');
    expect(threadDuplicated.data.review?.replies[0].content).toBe('Native rich reply');
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

  it('does not paste document-scoped native references into a different document', () => {
    useSessionStore.getState().setDocumentKey('first-document');
    const store = useAnnotationStore.getState();
    store.setAnnotations([baseAnnotation('native', 1, 20, 30)]);
    store.setSelection(['native']);
    store.copySelection();
    useSessionStore.getState().setDocumentKey('second-document');
    store.setAnnotations([]);
    store.pasteClipboard(1);
    expect(useAnnotationStore.getState().annotations).toEqual([]);
    useSessionStore.getState().setDocumentKey('first-document');
    store.pasteClipboard(1);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it('applies inspector appearance fields and legacy style aliases to the actual annotation data', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([baseAnnotation('appearance', 1, 10, 20)]);
    store.setSelection(['appearance']);
    store.updateStyleForSelection({
      backgroundColor: '#112233', borderColor: '#445566', borderWidth: 0,
      borderStyle: 'dashed', opacity: 0, autoSize: false, locked: true,
    });
    expect(useAnnotationStore.getState().annotations[0].data).toMatchObject({
      backgroundColor: '#112233', borderColor: '#445566', borderWidth: 0,
      borderStyle: 'dashed', opacity: 0, autoSize: false, locked: true,
    });
    store.updateStyleForSelection({ fill: '#abcdef', stroke: '#fedcba', strokeWidth: 2 });
    expect(useAnnotationStore.getState().annotations[0].data).toMatchObject({
      backgroundColor: '#abcdef', borderColor: '#fedcba', borderWidth: 2,
    });
  });

  it('does not recolor imported stamp artwork through a multi-selection style update', () => {
    const store = useAnnotationStore.getState();
    store.setAnnotations([
      { ...baseAnnotation('imported', 1, 10, 20), type: 'stamp', data: { hasCustomAppearance: true, nativeStampAppearanceKind: 'imported' } },
      { ...baseAnnotation('new', 1, 40, 20), type: 'stamp', data: {} },
    ]);
    store.setSelection(['imported', 'new']);
    store.updateStyleForSelection({ backgroundColor: '#00ff00', locked: true });
    const items = useAnnotationStore.getState().annotations;
    expect(items[0].data.backgroundColor).toBeUndefined();
    expect(items[0].data.locked).toBe(true);
    expect(items[1].data.backgroundColor).toBe('#00ff00');
    expect(items[1].data.locked).toBe(true);
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
