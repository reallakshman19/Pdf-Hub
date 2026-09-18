import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationStore } from './store';
import { useSessionStore } from '../session/store';
import type { PdfAnnotation } from './types';

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
      history: [],
      future: [],
      activeAnnotationId: null,
      selectedAnnotationIds: [],
      clipboard: [],
    });
    useSessionStore.setState({
      isDirty: false,
      isDocumentDirty: false,
      isSessionDirty: false,
    });
  });

  it('add/update/delete manage selection and history snapshots', () => {
    const store = useAnnotationStore.getState();

    store.addAnnotation(baseAnnotation('a1', 1, 10, 20));
    store.addAnnotation(baseAnnotation('a2', 1, 30, 40));

    let state = useAnnotationStore.getState();
    expect(state.annotations).toHaveLength(2);
    expect(state.selectedAnnotationIds).toEqual(['a2']);
    expect(state.activeAnnotationId).toBe('a2');
    expect(state.history).toHaveLength(2);

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
});
