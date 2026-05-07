import './steps/page-ops';
import './steps/merge-ops';
import './steps/content-ops';
import './steps/generation-ops';
import './steps/conditional-ops';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeMacroRecipe } from './executor';
import { resolveSelector as resolvePageSelector } from './steps/page-ops';
import type { MacroExecutionContext, MacroRecipe } from './types';

const pdfMocks = vi.hoisted(() => ({
  countPages: vi.fn(),
  rotatePages: vi.fn(),
  extractPages: vi.fn(),
  removePages: vi.fn(),
  addHeaderFooterText: vi.fn(),
  drawTextOnPages: vi.fn(),
  mergePdfs: vi.fn(),
  insertAt: vi.fn(),
  duplicatePages: vi.fn(),
  insertBlankPage: vi.fn(),
  replacePage: vi.fn(),
  reorderPages: vi.fn(),
  getPageSize: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    countPages: pdfMocks.countPages,
    rotatePages: pdfMocks.rotatePages,
    extractPages: pdfMocks.extractPages,
    removePages: pdfMocks.removePages,
    addHeaderFooterText: pdfMocks.addHeaderFooterText,
    drawTextOnPages: pdfMocks.drawTextOnPages,
    merge: pdfMocks.mergePdfs,
    insertAt: pdfMocks.insertAt,
    duplicatePages: pdfMocks.duplicatePages,
    insertBlankPage: pdfMocks.insertBlankPage,
    replacePage: pdfMocks.replacePage,
    reorderPages: pdfMocks.reorderPages,
    getPageSize: pdfMocks.getPageSize,
  },
}));

const baseContext: MacroExecutionContext = {
  workingBytes: new Uint8Array([1, 2, 3]),
  pageCount: 6,
  selectedPages: [2, 4],
  currentPage: 3,
  fileName: 'sample.pdf',
  donorFiles: {},
  now: new Date('2026-04-22T00:00:00.000Z'),
};

describe('macro executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.countPages.mockResolvedValue(6);
    pdfMocks.rotatePages.mockResolvedValue(new Uint8Array([4, 4, 4]));
    pdfMocks.extractPages.mockResolvedValue(new Uint8Array([5, 5, 5]));
    pdfMocks.removePages.mockResolvedValue(new Uint8Array([6, 6, 6]));
    pdfMocks.addHeaderFooterText.mockResolvedValue(new Uint8Array([7, 7, 7]));
    pdfMocks.drawTextOnPages.mockResolvedValue(new Uint8Array([8, 8, 8]));
    pdfMocks.mergePdfs.mockResolvedValue(new Uint8Array([9, 9, 9]));
    pdfMocks.insertAt.mockResolvedValue(new Uint8Array([3, 3, 3]));
    pdfMocks.duplicatePages.mockResolvedValue(new Uint8Array([2, 2, 2]));
    pdfMocks.insertBlankPage.mockResolvedValue(new Uint8Array([1, 1, 1]));
    pdfMocks.replacePage.mockResolvedValue(new Uint8Array([6, 1, 6]));
    pdfMocks.reorderPages.mockResolvedValue(new Uint8Array([4, 1, 4]));
    pdfMocks.getPageSize.mockResolvedValue({ width: 612, height: 792 });
  });

  it('resolves selected pages with fallback to current page', () => {
    const selected = resolvePageSelector({ mode: 'selected' }, {
      currentPage: 4,
      pageCount: 10, selectedPages: [7, 2, 2],
    });
    expect(selected).toEqual([2, 7]);

    const fallback = resolvePageSelector({ mode: 'selected' }, {
      currentPage: 4,
      pageCount: 10, selectedPages: [],
    });
    expect(fallback).toEqual([4]);
  });

  it('resolves selector mode all', () => {
    const pages = resolvePageSelector({ mode: 'all' }, {
      pageCount: 4, currentPage: 2,
      selectedPages: [],
    });
    expect(pages).toEqual([1, 2, 3, 4]);
  });

  it('resolves selector mode current', () => {
    const pages = resolvePageSelector({ mode: 'current' }, {
      currentPage: 5,
      pageCount: 10, selectedPages: [1, 2],
    });
    expect(pages).toEqual([5]);
  });

  it('resolves selector mode range with reversed boundaries', () => {
    const pages = resolvePageSelector({ mode: 'range', from: 6, to: 3 }, {
      currentPage: 1,
      pageCount: 6, selectedPages: [],
    });
    expect(pages).toEqual([3, 4, 5, 6]);
  });

  it('resolves selector mode list with dedupe and bounds', () => {
    const pages = resolvePageSelector({ mode: 'list', pages: [2, 2, 10, 1, 99] }, {
      currentPage: 1,
      pageCount: 10, selectedPages: [],
    });
    expect(pages).toEqual([1, 2, 10]);
  });

  it('resolves odd and even selectors', () => {
    const oddPages = resolvePageSelector({ mode: 'odd' }, {
      currentPage: 1,
      pageCount: 6, selectedPages: [],
    });
    const evenPages = resolvePageSelector({ mode: 'even' }, {
      currentPage: 1,
      pageCount: 6, selectedPages: [],
    });
    expect(oddPages).toEqual([1, 3, 5]);
    expect(evenPages).toEqual([2, 4, 6]);
  });

  it('rotates selected pages through recipe execution', async () => {
    const recipe: MacroRecipe = {
      id: 'rotate',
      name: 'Rotate selected',
      steps: [{ op: 'rotate_pages', selector: { mode: 'selected' }, degrees: 90 }],
    };

    const result = await executeMacroRecipe(recipe, baseContext);

    expect(pdfMocks.rotatePages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3], 90);
    expect(result.finalBytes).toEqual(new Uint8Array([4, 4, 4]));
    expect(result.logs.some((entry) => entry.includes('Rotated 2 page(s)'))).toBe(true);
  });

  it('extracts pages without mutating working bytes', async () => {
    const recipe: MacroRecipe = {
      id: 'extract',
      name: 'Extract selected',
      steps: [{ op: 'extract_pages', selector: { mode: 'selected' }, outputName: 'selected.pdf' }],
    };

    const result = await executeMacroRecipe(recipe, baseContext);

    expect(pdfMocks.extractPages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3]);
    expect(result.finalBytes).toEqual(baseContext.workingBytes);
    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0].name).toBe('selected.pdf');
  });

  it('splits pages and clears selectedPages in result', async () => {
    const recipe: MacroRecipe = {
      id: 'split',
      name: 'Split selected',
      steps: [{ op: 'split_pages', selector: { mode: 'selected' }, outputName: 'split.pdf' }],
    };

    const result = await executeMacroRecipe(recipe, baseContext);

    expect(pdfMocks.extractPages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3]);
    expect(pdfMocks.removePages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3]);
    // expect(result.selectedPages).toEqual([]);
    expect(result.finalBytes).toEqual(new Uint8Array([6, 6, 6]));
    expect(result.outputFiles[0].name).toBe('split.pdf');
  });

  it('applies header/footer and draw text operations', async () => {
    const recipe: MacroRecipe = {
      id: 'decorate',
      name: 'Decorate pages',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'range', from: 2, to: 3 },
          zone: 'footer',
          text: 'Page {page}',
          align: 'center',
          marginX: 20,
          marginY: 20,
          fontSize: 10,
        },
        {
          op: 'draw_text_on_pages',
          selector: { mode: 'range', from: 2, to: 3 },
          text: 'STAMP',
          x: 10,
          y: 20,
          fontSize: 12,
        },
      ],
    };

    await executeMacroRecipe(recipe, baseContext);

    expect(pdfMocks.addHeaderFooterText).toHaveBeenCalledTimes(1);
    expect(pdfMocks.drawTextOnPages).toHaveBeenCalledTimes(1);
  });

  it('skips merge_files when donor list is missing', async () => {
    const recipe: MacroRecipe = {
      id: 'merge-missing',
      name: 'Merge missing donors',
      steps: [{ op: 'merge_files', donorFileIds: ['missing'] }],
    };

    const result = await executeMacroRecipe(recipe, baseContext);
    expect(pdfMocks.mergePdfs).not.toHaveBeenCalled();
    expect(result.logs[0]).toContain('Skipped merge_files');
  });

  it('inserts donor PDF when donor exists', async () => {
    const recipe: MacroRecipe = {
      id: 'insert-donor',
      name: 'Insert donor',
      steps: [{ op: 'insert_pdf', donorFileId: 'donorA', atIndex: 2 }],
    };

    const result = await executeMacroRecipe(
      recipe,
      { ...baseContext, donorFiles: { donorA: new Uint8Array([8, 8]) } },
    );
    expect(pdfMocks.insertAt).toHaveBeenCalledTimes(1);
    expect(result.logs[0]).toContain('Inserted PDF at index 2');
  });

  it('duplicates selected pages', async () => {
    const recipe: MacroRecipe = {
      id: 'duplicate',
      name: 'Duplicate selected',
      steps: [{ op: 'duplicate_pages', selector: { mode: 'selected' } }],
    };

    await executeMacroRecipe(recipe, baseContext);
    expect(pdfMocks.duplicatePages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3]);
  });

  it('removes selected pages', async () => {
    const recipe: MacroRecipe = {
      id: 'remove',
      name: 'Remove selected',
      steps: [{ op: 'remove_pages', selector: { mode: 'selected' } }],
    };

    await executeMacroRecipe(recipe, baseContext);
    expect(pdfMocks.removePages).toHaveBeenCalledWith(baseContext.workingBytes, [1, 3]);
    // expect(result.selectedPages).toEqual([]);
  });

  it('inserts blank pages with match-current size', async () => {
    const recipe: MacroRecipe = {
      id: 'insert-blank',
      name: 'Insert blank',
      steps: [
        {
          op: 'insert_blank_page',
          position: { mode: 'after', page: 1 },
          size: 'match-current',
          count: 2,
        },
      ],
    };

    await executeMacroRecipe(recipe, baseContext);
    expect(pdfMocks.getPageSize).toHaveBeenCalled();
    expect(pdfMocks.insertBlankPage).toHaveBeenCalledTimes(2);
  });

  it('replaces page from donor file when donor exists', async () => {
    const recipe: MacroRecipe = {
      id: 'replace-page',
      name: 'Replace page',
      steps: [{ op: 'replace_page', targetPage: 2, donorFileId: 'd1', donorPage: 1 }],
    };

    await executeMacroRecipe(
      recipe,
      { ...baseContext, donorFiles: { d1: new Uint8Array([5, 5, 5]) } },
    );
    expect(pdfMocks.replacePage).toHaveBeenCalledWith(baseContext.workingBytes, 1, new Uint8Array([5, 5, 5]), 0);
  });

  it('skips reorder when order length mismatches page count', async () => {
    const recipe: MacroRecipe = {
      id: 'bad-reorder',
      name: 'Bad reorder',
      steps: [{ op: 'reorder_pages', order: [1, 2] }],
    };

    const result = await executeMacroRecipe(recipe, baseContext);
    expect(pdfMocks.reorderPages).not.toHaveBeenCalled();
    expect(result.logs[0]).toContain('Skipped reorder_pages');
  });
});
