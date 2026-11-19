import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroRecipe } from './types';
import { runMacroRecipeAgainstSession } from './sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useMacroOutputQueueStore } from './outputQueueStore';

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
    extractPages: vi.fn(async () => new Uint8Array([7, 7])),
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
    useMacroOutputQueueStore.getState().clearOutputs();

    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sample-doc',
      pageCount: 1,
      selectedPageIds: [],
      selectedPages: [1],
      fileName: 'sample.pdf',
      viewState: {
        currentPageId: null,
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


  it('queues every auxiliary PDF after commit without unsafe auto-save', async () => {
    commandExecute.mockResolvedValueOnce({ success: true, mutated: true, message: 'ok' });
    const extract: MacroRecipe = {
      id: 'extract-one',
      name: 'Extract current',
      steps: [{ op: 'extract_pages', selector: { mode: 'current' } }],
    };
    const result = await runMacroRecipeAgainstSession(extract, { saveOutputs: true });

    expect(result.success).toBe(true);
    expect(commandExecute).toHaveBeenCalledTimes(1);
    expect(FileAdapter.savePdfBytes).not.toHaveBeenCalled();
    const pending = useMacroOutputQueueStore.getState().outputs;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sourceKind: 'macro',
      sourceDocumentKey: 'sample-doc',
      sourceRecipeId: 'extract-one',
      name: 'extracted-sample.pdf',
      bytes: new Uint8Array([7, 7]),
    });
  });

  it('does not publish output PDFs when the working-copy commit fails', async () => {
    commandExecute.mockResolvedValueOnce({
      success: false,
      mutated: false,
      error: { code: 'STALE_DOCUMENT', message: 'Source changed.' },
    });
    const extract: MacroRecipe = {
      id: 'extract-commit-failed',
      name: 'Extract on stale session',
      steps: [{ op: 'extract_pages', selector: { mode: 'current' } }],
    };
    const result = await runMacroRecipeAgainstSession(extract, { saveOutputs: true });
    expect(result.success).toBe(false);
    expect(useMacroOutputQueueStore.getState().outputs).toEqual([]);
    expect(FileAdapter.savePdfBytes).not.toHaveBeenCalled();
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