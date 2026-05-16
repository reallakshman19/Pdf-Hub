import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeMacroRecipe } from './executor';
import { PdfEditAdapter } from '../../adapters/pdf-edit/PdfEditAdapter';
import type { MacroExecutionContext } from './types';

vi.mock('../../adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    merge: vi.fn(async () => new Uint8Array([9, 1])),
    insertAt: vi.fn(async () => new Uint8Array([9, 2])),
    countPages: vi.fn(async () => 5),
    rotatePages: vi.fn(async () => new Uint8Array([9, 3])),
    extractPages: vi.fn(async () => new Uint8Array([9, 4])),
    removePages: vi.fn(async () => new Uint8Array([9, 5])),
    duplicatePages: vi.fn(async () => new Uint8Array([9, 6])),
    insertBlankPage: vi.fn(async () => new Uint8Array([9, 7])),
    replacePage: vi.fn(async () => new Uint8Array([9, 8])),
    reorderPages: vi.fn(async () => new Uint8Array([9, 9])),
    getPageSize: vi.fn(async () => ({ width: 595, height: 842 })),
    drawTextOnPages: vi.fn(async () => new Uint8Array([7, 7])),
    addHeaderFooterText: vi.fn(async () => new Uint8Array([7, 8])),
    insertImage: vi.fn(async () => new Uint8Array([7, 9])),
  },
}));

function ctx(): MacroExecutionContext {
  return {
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 3,
    selectedPages: [1],
    currentPage: 1,
    fileName: 'sample-IFC.pdf',
    donorFiles: {
      donorA: new Uint8Array([10]),
      donorB: new Uint8Array([11]),
    },
    now: new Date('2026-01-02T03:04:05.000Z'),
    options: {
      abortOnError: true,
    },
  };
}

describe('macro runtime slice 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('register-all is loaded by executor and merge_files calls PdfEditAdapter.merge', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'merge',
        name: 'Merge',
        steps: [
          {
            op: 'merge_files',
            donorFileIds: ['donorA', 'donorB'],
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(PdfEditAdapter.merge).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      [
        new Uint8Array([10]),
        new Uint8Array([11]),
      ],
    );
    expect(result.finalBytes).toEqual(new Uint8Array([9, 1]));
  });

  it('insert_pdf calls PdfEditAdapter.insertAt and updates page count', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'insert',
        name: 'Insert',
        steps: [
          {
            op: 'insert_pdf',
            donorFileId: 'donorA',
            atIndex: 1,
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(PdfEditAdapter.insertAt).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      new Uint8Array([10]),
      1,
    );
    expect(result.finalBytes).toEqual(new Uint8Array([9, 2]));
  });

  it('missing donor fails honestly with rollback and no fake success', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'missing-donor',
        name: 'Missing Donor',
        steps: [
          {
            op: 'insert_pdf',
            donorFileId: 'missing',
            atIndex: 1,
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.finalBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(PdfEditAdapter.insertAt).not.toHaveBeenCalled();
  });

  it('apply_template_vars affects later step expansion at runtime', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'vars',
        name: 'Vars',
        steps: [
          {
            op: 'apply_template_vars',
            vars: {
              stamp: 'IFC',
            },
          },
          {
            op: 'draw_text_on_pages',
            selector: {
              mode: 'current',
            },
            text: '{{stamp}} REVIEW {{filename}}',
            x: 10,
            y: 10,
            fontSize: 12,
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(PdfEditAdapter.drawTextOnPages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        text: 'IFC REVIEW sample-IFC.pdf',
      }),
    );
  });

  it('conditional executes the matching branch', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'conditional',
        name: 'Conditional',
        steps: [
          {
            op: 'conditional',
            condition: {
              type: 'filename_contains',
              value: 'IFC',
            },
            then: [
              {
                op: 'select_pages',
                selector: {
                  mode: 'range',
                  from: 2,
                  to: 3,
                },
              },
            ],
            else: [
              {
                op: 'select_pages',
                selector: {
                  mode: 'current',
                },
              },
            ],
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(result.selectedPages).toEqual([2, 3]);
  });

  it('dry-run does not call adapter mutations', async () => {
    const result = await executeMacroRecipe(
      {
        id: 'dry',
        name: 'Dry',
        dryRun: true,
        steps: [
          {
            op: 'merge_files',
            donorFileIds: ['donorA'],
          },
        ],
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(result.finalBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(PdfEditAdapter.merge).not.toHaveBeenCalled();
  });
});