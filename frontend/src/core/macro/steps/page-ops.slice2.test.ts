import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MacroExecutionContext } from '../types';
import type { MacroMutableState } from '../registry';
import { macroRegistry } from '../registry';
import {
  resolvePageSelector,
  resolveSelector,
  toZeroBasedPageIndices,
} from './page-ops';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';

vi.mock('../../../adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    rotatePages: vi.fn(async () => new Uint8Array([9, 9, 9])),
    extractPages: vi.fn(async () => new Uint8Array([7, 7])),
    removePages: vi.fn(async () => new Uint8Array([8, 8])),
    duplicatePages: vi.fn(async () => new Uint8Array([6, 6])),
    insertBlankPage: vi.fn(async () => new Uint8Array([5, 5])),
    replacePage: vi.fn(async () => new Uint8Array([4, 4])),
    reorderPages: vi.fn(async () => new Uint8Array([3, 3])),
    countPages: vi.fn(async () => 2),
    getPageSize: vi.fn(async () => ({ width: 595, height: 842 })),
  },
}));

const ctx = (): MacroExecutionContext => ({
  workingBytes: new Uint8Array([1, 2, 3]),
  pageCount: 3,
  selectedPages: [2],
  currentPage: 1,
  fileName: 'sample.pdf',
  donorFiles: {
    donor: new Uint8Array([10, 20, 30]),
  },
  options: {
    abortOnError: true,
  },
});

const state = (): MacroMutableState => ({
  workingBytes: new Uint8Array([1, 2, 3]),
  pageCount: 3,
  selectedPages: [2],
  templateVars: {},
  logs: [],
  outputFiles: [],
});

describe('page-ops slice 2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves selectors with one-based page numbers', () => {
    expect(resolvePageSelector({ mode: 'all' }, {
      pageCount: 4,
      selectedPages: [],
      currentPage: 2,
    })).toEqual([1, 2, 3, 4]);

    expect(resolvePageSelector({ mode: 'odd' }, {
      pageCount: 5,
      selectedPages: [],
      currentPage: 1,
    })).toEqual([1, 3, 5]);

    expect(resolvePageSelector({ mode: 'even' }, {
      pageCount: 5,
      selectedPages: [],
      currentPage: 1,
    })).toEqual([2, 4]);

    expect(resolvePageSelector({ mode: 'selected' }, {
      pageCount: 5,
      selectedPages: [5, 2, 2, 99],
      currentPage: 1,
    })).toEqual([2, 5]);

    expect(resolvePageSelector({ mode: 'range', from: 3, to: 1 }, {
      pageCount: 5,
      selectedPages: [],
      currentPage: 1,
    })).toEqual([1, 2, 3]);

    expect(resolveSelector({ mode: 'current' }, {
      pageCount: 5,
      selectedPages: [],
      currentPage: 4,
    })).toEqual([4]);
  });

  it('converts one-based pages to adapter zero-based page indices', () => {
    expect(toZeroBasedPageIndices([1, 2, 5])).toEqual([0, 1, 4]);
  });

  it('select_pages emits selection_changed and does not directly mutate bytes', async () => {
    const currentState = state();

    const result = await macroRegistry.execute(
      {
        op: 'select_pages',
        selector: {
          mode: 'range',
          from: 1,
          to: 2,
        },
      },
      ctx(),
      currentState,
    );

    expect(result.status).toBe('success');
    expect(result.sideEffects).toContainEqual({
      type: 'selection_changed',
      selectedPages: [1, 2],
    });
    expect(result.sideEffects.some((effect) => effect.type === 'bytes_updated')).toBe(false);
  });

  it('rotate_pages calls PdfEditAdapter.rotatePages with zero-based indices', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'rotate_pages',
        selector: {
          mode: 'selected',
        },
        degrees: 90,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.rotatePages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      [1],
      90,
    );
    expect(result.sideEffects).toContainEqual({
      type: 'bytes_updated',
      bytes: new Uint8Array([9, 9, 9]),
    });
  });

  it('extract_pages creates output_file and does not update bytes', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'extract_pages',
        selector: {
          mode: 'current',
        },
        outputName: 'one-page.pdf',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.extractPages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      [0],
    );
    expect(result.sideEffects.some((effect) => effect.type === 'bytes_updated')).toBe(false);
    expect(result.sideEffects).toContainEqual({
      type: 'output_file',
      name: 'one-page.pdf',
      bytes: new Uint8Array([7, 7]),
    });
  });

  it('split_pages extracts output, removes pages, updates count, clears selection', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'split_pages',
        selector: {
          mode: 'selected',
        },
        outputName: 'split.pdf',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.extractPages).toHaveBeenCalledWith(expect.any(Uint8Array), [1]);
    expect(PdfEditAdapter.removePages).toHaveBeenCalledWith(expect.any(Uint8Array), [1]);
    expect(result.sideEffects).toContainEqual({
      type: 'page_count_changed',
      newCount: 2,
    });
    expect(result.sideEffects).toContainEqual({
      type: 'selection_changed',
      selectedPages: [],
    });
  });

  it('duplicate_pages updates bytes and page count', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'duplicate_pages',
        selector: {
          mode: 'selected',
        },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.duplicatePages).toHaveBeenCalledWith(expect.any(Uint8Array), [1]);
    expect(result.sideEffects).toContainEqual({
      type: 'page_count_changed',
      newCount: 2,
    });
  });

  it('remove_pages updates bytes, page count, and selection', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'remove_pages',
        selector: {
          mode: 'selected',
        },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.removePages).toHaveBeenCalledWith(expect.any(Uint8Array), [1]);
    expect(result.sideEffects).toContainEqual({
      type: 'selection_changed',
      selectedPages: [],
    });
  });

  it('insert_blank_page calls PdfEditAdapter.insertBlankPage', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'insert_blank_page',
        position: {
          mode: 'end',
        },
        size: 'a4',
        count: 1,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertBlankPage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      3,
      { width: 595, height: 842 },
    );
  });

  it('replace_page errors with no side effects when donor file is missing', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'replace_page',
        targetPage: 1,
        donorFileId: 'missing',
        donorPage: 1,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('error');
    expect(result.sideEffects).toEqual([]);
    expect(PdfEditAdapter.replacePage).not.toHaveBeenCalled();
  });

  it('replace_page uses donor bytes when donor is available', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'replace_page',
        targetPage: 1,
        donorFileId: 'donor',
        donorPage: 1,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.replacePage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      0,
      new Uint8Array([10, 20, 30]),
      0,
    );
  });

  it('reorder_pages rejects wrong-length order without side effects', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'reorder_pages',
        order: [1, 2],
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('error');
    expect(result.sideEffects).toEqual([]);
    expect(PdfEditAdapter.reorderPages).not.toHaveBeenCalled();
  });

  it('reorder_pages passes zero-based order to adapter', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'reorder_pages',
        order: [3, 1, 2],
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.reorderPages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      [2, 0, 1],
    );
  });
});
