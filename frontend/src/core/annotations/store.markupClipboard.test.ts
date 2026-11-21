import { beforeEach, describe, expect, it } from 'vitest';
import { useAnnotationStore } from './store';
import { useSessionStore } from '../session/store';
import { useToastStore } from '../toast/store';
import type { PageGraph, PageNode } from '../pages/types';
import type { PdfAnnotation } from './types';

function graph(): PageGraph<PageNode> {
  return { pages: [0, 90].map((rotation, index) => ({
    pageId: `p${index + 1}`, documentKey: 'doc', originalPageNumber: index + 1,
    currentIndex: index, width: 400, height: 500, rotation: rotation as 0 | 90,
  })) };
}

function markup(source: 'draft' | 'native'): PdfAnnotation {
  return { id: 'a', type: 'underline', pageNumber: 1,
    rect: { x: 10, y: 20, width: 100, height: 20 },
    data: { textMarkupQuads: [0, 0, 1, 0, 0, 1, 1, 1], ...(source === 'draft'
      ? { nativeMarkupDraft: { basisRotation: 0, turns: 1 } }
      : { nativeSourceRef: '5 0 R', nativeOriginalName: 'a', nativeMarkupRotationSourceHash: 'source' }) },
    createdAt: 1, updatedAt: 1 };
}

function copy(source: 'draft' | 'native') {
  useAnnotationStore.getState().setAnnotations([markup(source)]);
  useAnnotationStore.getState().setSelection(['a']);
  useAnnotationStore.getState().copySelection();
}

describe('markup clipboard page safety', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], selectedAnnotationIds: [], activeAnnotationId: null,
      clipboard: [], clipboardDocumentKey: null, clipboardPageSnapshot: null });
    useToastStore.setState({ toasts: [] });
    useSessionStore.getState().clearDocument();
    useSessionStore.setState({ documentKey: 'doc', pageGraph: graph() });
  });

  it.each(['draft', 'native'] as const)('pastes %s markup when page identities and rotations match', (source) => {
    copy(source);
    // A fresh graph object with the same page identity is not a page change.
    useSessionStore.setState({ pageGraph: graph() });
    useAnnotationStore.getState().pasteClipboard(2);
    const pasted = useAnnotationStore.getState().annotations[1];
    expect(pasted.pageNumber).toBe(2);
    expect(pasted.pageId).toBe('p2');
    if (source === 'draft') expect(pasted.data.nativeMarkupDraft).toEqual({ basisRotation: 90, turns: 1 });
    else expect(pasted.data.nativeMarkupPreviewOffset).toBe(3);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it.each(['draft', 'native'] as const)('rejects %s markup when page layout changes before paste', (source) => {
    const changes = [
      (value: PageGraph<PageNode>) => { value.pages[0].rotation = 90; },
      (value: PageGraph<PageNode>) => { value.pages[1].rotation = 180; },
      (value: PageGraph<PageNode>) => { value.pages.reverse(); value.pages.forEach((p, i) => { p.currentIndex = i; }); },
      (value: PageGraph<PageNode>) => { value.pages.pop(); },
      (value: PageGraph<PageNode>) => { value.pages.push({ ...value.pages[0], pageId: 'p3', currentIndex: 2 }); },
      (value: PageGraph<PageNode>) => { value.pages[0].width = 401; },
    ];
    for (const change of changes) {
      useSessionStore.setState({ pageGraph: graph() }); copy(source);
      const changed = graph(); change(changed); useSessionStore.setState({ pageGraph: changed });
      const before = useAnnotationStore.getState().annotations;
      useAnnotationStore.getState().pasteClipboard(2);
      expect(useAnnotationStore.getState().annotations).toBe(before);
      expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Copy markup again');
    }
  });

  it.each(['draft', 'native'] as const)('rejects %s markup with missing page information or a changed document', (source) => {
    copy(source); useSessionStore.setState({ pageGraph: null });
    useAnnotationStore.getState().pasteClipboard(2);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Copy markup again');
    useSessionStore.setState({ pageGraph: graph() }); copy(source);
    useSessionStore.setState({ documentKey: 'another-doc' });
    useAnnotationStore.getState().pasteClipboard(2);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Copy markup again');
  });

  it('requires a fresh copy after a layout change but accepts one after undo restores the graph', () => {
    copy('draft'); const original = graph(); const changed = graph(); changed.pages[0].rotation = 90;
    useSessionStore.setState({ pageGraph: changed }); useAnnotationStore.getState().pasteClipboard(2);
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    useSessionStore.setState({ pageGraph: original }); useAnnotationStore.getState().pasteClipboard(2);
    expect(useAnnotationStore.getState().annotations).toHaveLength(2);
  });
});
