import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterElementV2 } from '../types';
import { WRITER_PAGE_PRESETS } from '../types';
import { useWriterV2Store } from '../writerV2Store';

describe('writerV2Store blank document mode', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('creates blank Writer document and clears existing state', () => {
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: makeElement('existing', 0),
    });

    const meta = useWriterV2Store.getState().createBlankWriterDocument({
      title: 'New Doc Hub File',
      documentFingerprint: 'blank-doc-1',
      pageSetup: WRITER_PAGE_PRESETS.Letter,
      pageCount: 2,
      now: '2026-01-01T00:00:00.000Z',
    });

    const state = useWriterV2Store.getState();

    expect(meta.mode).toBe('blankDocument');
    expect(state.currentDocumentFingerprint).toBe('blank-doc-1');
    expect(state.documentMeta?.title).toBe('New Doc Hub File');
    expect(state.documentMeta?.pageSetup.preset).toBe('Letter');
    expect(state.documentMeta?.pageCount).toBe(2);
    expect(state.elements).toEqual([]);
    expect(state.selectedIds).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.dirty).toBe(true);
  });

  it('updates blank document page setup only in blank mode', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-2',
      now: '2026-01-01T00:00:00.000Z',
    });

    useWriterV2Store.getState().updateBlankWriterPageSetup(
      {
        marginLeft: 36,
        marginRight: 36,
      },
      '2026-01-02T00:00:00.000Z',
    );

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.pageSetup.marginLeft).toBe(36);
    expect(state.documentMeta?.pageSetup.marginRight).toBe(36);
    expect(state.documentMeta?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('adds blank page and shifts later elements', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-add-page',
      pageCount: 2,
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'BATCH_ADD_WRITER_ELEMENTS',
      elements: [
        makeElement('a', 0),
        makeElement('b', 1),
      ],
    });

    useWriterV2Store.getState().addBlankWriterPage(0, '2026-01-03T00:00:00.000Z');

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.pageCount).toBe(3);
    expect(state.elements.map((element) => [element.id, element.pageIndex])).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });

  it('deletes blank page and removes selected element on that page', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-delete-page',
      pageCount: 3,
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'BATCH_ADD_WRITER_ELEMENTS',
      elements: [
        makeElement('a', 0),
        makeElement('b', 1),
        makeElement('c', 2),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['b', 'c'],
    });

    useWriterV2Store.getState().deleteBlankWriterPage(1, '2026-01-03T00:00:00.000Z');

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.pageCount).toBe(2);
    expect(state.elements.map((element) => [element.id, element.pageIndex])).toEqual([
      ['a', 0],
      ['c', 1],
    ]);
    expect(state.selectedIds).toEqual(['c']);
    expect(state.activeId).toBe('c');
  });

  it('duplicates blank page and selects duplicated elements', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-duplicate-page',
      pageCount: 1,
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: makeElement('a', 0),
    });

    useWriterV2Store.getState().duplicateBlankWriterPage(0, '2026-01-03T00:00:00.000Z');

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.pageCount).toBe(2);
    expect(state.elements).toHaveLength(2);
    expect(state.elements.map((element) => element.pageIndex).sort()).toEqual([0, 1]);
    expect(state.selectedIds).toHaveLength(1);
    expect(state.activeId).toBe(state.selectedIds[0]);
  });

  it('hydrates existing sessions with pdfOverlay metadata fallback', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'pdf-doc-1',
      elements: [
        makeElement('a', 0),
        makeElement('b', 3),
      ],
    });

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.mode).toBe('pdfOverlay');
    expect(state.documentMeta?.documentFingerprint).toBe('pdf-doc-1');
    expect(state.documentMeta?.pageCount).toBe(4);
    expect(state.currentDocumentFingerprint).toBe('pdf-doc-1');
    expect(state.dirty).toBe(false);
  });

  it('hydrates blank document metadata when supplied', () => {
    const meta = useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-source',
      pageCount: 2,
    });

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: meta.documentFingerprint,
      elements: [makeElement('a', 1)],
      documentMeta: meta,
    });

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.mode).toBe('blankDocument');
    expect(state.documentMeta?.pageCount).toBe(2);
    expect(state.elements[0].pageIndex).toBe(1);
  });
});

function makeElement(id: string, pageIndex: number): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-test',
    pageIndex,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
    plainText: id,
    style: {
      zIndex: 1,
      fontSize: 12,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
