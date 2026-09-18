import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroRecipe } from './types';
import { runMacroRecipeAgainstSession } from './sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';

const commandExecute = vi.fn();

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: commandExecute,
  },
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
      documentKey: 'sample-doc',
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
    expect(commandExecute).not.toHaveBeenCalled();
  });

  it('normal run commits successful result through the canonical command bus', async () => {
    commandExecute.mockResolvedValueOnce({
      success: true,
      mutated: true,
      message: 'ok',
    });

    const result = await runMacroRecipeAgainstSession(recipe);

    expect(result.success).toBe(true);
    expect(PdfEditAdapter.rotatePages).toHaveBeenCalled();
    expect(commandExecute).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        type: 'APPLY_WORKING_COPY',
        source: 'macro-runner',
        documentKey: 'sample-doc',
        payload: expect.objectContaining({
          binaryResourceId: 'macro:final-bytes',
          macro: expect.objectContaining({
            recipeId: 'rotate',
            recipeName: 'Rotate',
          }),
        }),
      }),
      resources: {
        binaries: {
          'macro:final-bytes': new Uint8Array([9, 9, 9]),
        },
      },
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
    expect(commandExecute).not.toHaveBeenCalled();
  });
});