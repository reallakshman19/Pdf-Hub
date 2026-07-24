import './register-all';
import { describe, expect, it, vi } from 'vitest';
import { executeMacroRecipe } from './executor';
import type { MacroExecutionContext, MacroRecipe } from './types';

const pdfMocks = vi.hoisted(() => ({
  rotatePages: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    rotatePages: pdfMocks.rotatePages,
  },
}));

const context: MacroExecutionContext = {
  workingBytes: new Uint8Array([1, 2, 3]),
  pageCount: 1,
  selectedPages: [1],
  currentPage: 1,
  fileName: 'cancel.pdf',
  donorFiles: {},
  now: new Date('2026-07-24T00:00:00.000Z'),
};

const recipe: MacroRecipe = {
  id: 'cancel-test',
  name: 'Cancellation test',
  steps: [{ op: 'rotate_pages', selector: { mode: 'all' }, degrees: 90 }],
};

describe('macro cooperative cancellation', () => {
  it('rolls back and ignores a late PDF result after user cancellation', async () => {
    let resolveRotate!: (bytes: Uint8Array) => void;
    pdfMocks.rotatePages.mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => {
      resolveRotate = resolve;
    }));
    const controller = new AbortController();

    const pending = executeMacroRecipe(recipe, {
      ...context,
      options: { abortSignal: controller.signal },
    });
    await Promise.resolve();
    controller.abort('cancelled by user');

    const result = await pending;
    expect(result.status).toBe('cancelled');
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.rolledBack).toBe(true);
    expect(Array.from(result.finalBytes)).toEqual([1, 2, 3]);
    expect(result.outputFiles).toEqual([]);

    resolveRotate(new Uint8Array([9, 9, 9]));
    await Promise.resolve();
    expect(Array.from(result.finalBytes)).toEqual([1, 2, 3]);
  });

  it('reports deadline expiry separately from ordinary failure', async () => {
    pdfMocks.rotatePages.mockImplementationOnce(() => new Promise<Uint8Array>(() => undefined));

    const result = await executeMacroRecipe(recipe, {
      ...context,
      options: { resourceLimits: { maxExecutionMs: 5 } },
    });

    expect(result.status).toBe('timed-out');
    expect(result.timedOut).toBe(true);
    expect(result.rolledBack).toBe(true);
    expect(Array.from(result.finalBytes)).toEqual([1, 2, 3]);
  });
});
