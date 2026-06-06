import {
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterElementV2 } from '../types';
import {
  WRITER_PAGE_PRESETS,
} from '../types';
import {
  addWriterPage,
  createBlankWriterDocumentMeta,
  createWriterPageSetup,
  deleteWriterPage,
  duplicateWriterPage,
  getWriterPageContentBounds,
  normalizeWriterPageCount,
  normalizeWriterPageSetup,
  updateWriterDocumentPageSetup,
} from '../writerDocumentMode';

describe('writerDocumentMode', () => {
  it('creates default blank document metadata', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-blank-1',
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(meta.documentFingerprint).toBe('doc-blank-1');
    expect(meta.mode).toBe('blankDocument');
    expect(meta.title).toBe('Untitled document');
    expect(meta.pageSetup).toEqual(WRITER_PAGE_PRESETS.A4);
    expect(meta.pageCount).toBe(1);
    expect(meta.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(meta.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('creates preset page setup and custom patch', () => {
    const setup = createWriterPageSetup('Letter', {
      marginTop: 36,
      marginBottom: 36,
      backgroundColor: '#f8fafc',
    });

    expect(setup.preset).toBe('Letter');
    expect(setup.width).toBe(612);
    expect(setup.height).toBe(792);
    expect(setup.marginTop).toBe(36);
    expect(setup.marginBottom).toBe(36);
    expect(setup.backgroundColor).toBe('#f8fafc');
  });

  it('normalizes invalid page setup values', () => {
    const setup = normalizeWriterPageSetup({
      preset: 'Custom',
      width: 10,
      height: 10,
      unit: 'pt',
      marginTop: 9999,
      marginRight: 9999,
      marginBottom: 9999,
      marginLeft: 9999,
    });

    expect(setup.width).toBe(144);
    expect(setup.height).toBe(144);
    expect(setup.marginTop).toBeLessThan(72);
    expect(setup.marginLeft).toBeLessThan(72);
    expect(setup.backgroundColor).toBe('#ffffff');
  });

  it('updates page setup and timestamp', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-blank-2',
      now: '2026-01-01T00:00:00.000Z',
    });

    const updated = updateWriterDocumentPageSetup(
      meta,
      {
        marginLeft: 24,
        marginRight: 24,
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(updated.pageSetup.marginLeft).toBe(24);
    expect(updated.pageSetup.marginRight).toBe(24);
    expect(updated.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(updated.createdAt).toBe(meta.createdAt);
  });

  it('adds page and shifts later elements', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-add-page',
      pageCount: 2,
      now: '2026-01-01T00:00:00.000Z',
    });

    const elements = [
      makeElement('a', 0),
      makeElement('b', 1),
    ];

    const result = addWriterPage(meta, elements, {
      afterPageIndex: 0,
      now: '2026-01-02T00:00:00.000Z',
    });

    expect(result.insertedPageIndex).toBe(1);
    expect(result.meta.pageCount).toBe(3);
    expect(result.elements.map((element) => [element.id, element.pageIndex])).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });

  it('deletes page, removes page elements, and shifts later elements', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-delete-page',
      pageCount: 3,
      now: '2026-01-01T00:00:00.000Z',
    });

    const elements = [
      makeElement('a', 0),
      makeElement('b', 1),
      makeElement('c', 2),
    ];

    const { meta: nextMeta, result } = deleteWriterPage(meta, elements, {
      pageIndex: 1,
      selectedIds: ['b', 'c'],
      activeId: 'b',
      now: '2026-01-02T00:00:00.000Z',
    });

    expect(nextMeta.pageCount).toBe(2);
    expect(result.elements.map((element) => [element.id, element.pageIndex])).toEqual([
      ['a', 0],
      ['c', 1],
    ]);
    expect(result.selectedIds).toEqual(['c']);
    expect(result.activeId).toBe('c');
  });

  it('does not delete the final page', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-delete-final',
      pageCount: 1,
    });
    const elements = [makeElement('a', 0)];

    const { meta: nextMeta, result } = deleteWriterPage(meta, elements, {
      pageIndex: 0,
      selectedIds: ['a'],
      activeId: 'a',
    });

    expect(nextMeta).toBe(meta);
    expect(result.elements).toBe(elements);
    expect(result.pageCount).toBe(1);
    expect(result.selectedIds).toEqual(['a']);
    expect(result.activeId).toBe('a');
  });

  it('duplicates a page with cloned ids and shifts later elements', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-duplicate-page',
      pageCount: 2,
      now: '2026-01-01T00:00:00.000Z',
    });

    const elements = [
      makeElement('a', 0),
      makeElement('b', 1),
    ];

    const { meta: nextMeta, result } = duplicateWriterPage(meta, elements, {
      pageIndex: 0,
      idFactory: (sourceId) => `${sourceId}-copy`,
      now: '2026-01-02T00:00:00.000Z',
    });

    expect(nextMeta.pageCount).toBe(3);
    expect(result.duplicatedIds).toEqual(['a-copy']);
    expect(result.elements.map((element) => [element.id, element.pageIndex])).toEqual([
      ['a', 0],
      ['b', 2],
      ['a-copy', 1],
    ]);
  });

  it('normalizes page count', () => {
    expect(normalizeWriterPageCount(0)).toBe(1);
    expect(normalizeWriterPageCount(2.7)).toBe(2);
    expect(normalizeWriterPageCount(Number.NaN)).toBe(1);
  });

  it('computes content bounds from page setup', () => {
    const bounds = getWriterPageContentBounds({
      ...WRITER_PAGE_PRESETS.A4,
      marginLeft: 50,
      marginRight: 50,
      marginTop: 60,
      marginBottom: 70,
    });

    expect(bounds.x).toBe(50);
    expect(bounds.y).toBe(70);
    expect(bounds.width).toBeCloseTo(495.28);
    expect(bounds.height).toBeCloseTo(711.89);
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
