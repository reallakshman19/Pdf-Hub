import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroRecipe } from './types';
import { runMacroRecipeAgainstSession } from './sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';

const dispatchCommand = vi.fn();

vi.mock('@/core/commands/dispatch', () => ({
  dispatchCommand,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    savePdfBytes: vi.fn(),
  },
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    rotatePages: vi.fn(async () => new Uint8Array([9, 9, 9])),
  },
}));

const recipe: MacroRecipe = {
  id: 'rotate',
  name: 'Rotate',
  steps: [
    {
      op: 'rotate_pages',
      selector: {
        mode: 'current',
      },
      degrees: 90,
    },
  ],
};

describe('sessionRunner slice 12', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      pageCount: 1,
      selectedPages: [1],
      fileName: 'sample.pdf',
      viewState: {
        currentPage: 1,
        zoom: 100,
        fitMode: 'width',
        viewMode: 'continuous',
      },
    });
  });

  it('dryRun option forces recipe dryRun and does not call adapter mutation', async () => {
    const result = await runMacroRecipeAgainstSession(recipe, {
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.finalBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(PdfEditAdapter.rotatePages).not.toHaveBeenCalled();
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it('normal run dispatches successful result', async () => {
    const result = await runMacroRecipeAgainstSession(recipe);

    expect(result.success).toBe(true);
    expect(PdfEditAdapter.rotatePages).toHaveBeenCalled();
    expect(dispatchCommand).toHaveBeenCalledWith(expect.objectContaining({
      source: 'macro-runner',
      command: expect.objectContaining({
        type: 'REPLACE_WORKING_COPY',
        nextBytes: new Uint8Array([9, 9, 9]),
      }),
    }));
  });

  it('does not dispatch failed macro result', async () => {
    const failedRecipe: MacroRecipe = {
      id: 'bad',
      name: 'Bad',
      steps: [
        {
          op: 'replace_page',
          targetPage: 1,
          donorFileId: 'missing',
          donorPage: 1,
        },
      ],
    };

    const result = await runMacroRecipeAgainstSession(failedRecipe);

    expect(result.success).toBe(false);
    expect(dispatchCommand).not.toHaveBeenCalled();
  });
});