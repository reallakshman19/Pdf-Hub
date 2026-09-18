import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type { MacroRecipe } from '@/core/macro/types';
import { useSessionStore } from '@/core/session/store';
import { validateRecipeBeforeRun } from '@/core/macro/validation/validator';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { MacroBuilderExecutionPanel } from './MacroBuilderExecutionPanel';

vi.mock('@/core/macro/validation/validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/macro/validation/validator')>();
  return {
    ...actual,
    validateRecipeBeforeRun: vi.fn(),
  };
});

vi.mock('@/core/macro/sessionRunner', () => ({
  runMacroRecipeAgainstSession: vi.fn(),
}));

const validateMock = vi.mocked(validateRecipeBeforeRun);
const runMock = vi.mocked(runMacroRecipeAgainstSession);

const recipe: MacroRecipe = {
  id: 'builder-execution',
  name: 'Builder Execution',
  steps: [
    {
      op: 'select_pages',
      selector: { mode: 'all' },
    },
  ],
};

const validPreflight = {
  isValid: true,
  errors: [],
  warnings: [],
  dryRunLogs: ['Would select all pages.'],
  dryRunDiff: {
    initialPageCount: 2,
    finalPageCount: 2,
    modifiedBytes: false,
    selectedPagesBefore: [],
    selectedPagesAfter: [1, 2],
    outputFiles: [],
    annotationChanges: { added: 0, updated: 0, deleted: 0 },
    writerChanges: { added: 0, updated: 0, deleted: 0 },
    warnings: [],
    logs: ['Would select all pages.'],
  },
};

describe('MacroBuilderExecutionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clearDocument();
    useSessionStore.getState().openDocument({
      documentKey: 'builder-execution-doc',
      fileName: 'builder-execution.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 2,
    });

    validateMock.mockResolvedValue(validPreflight);
    runMock.mockResolvedValue({
      success: true,
      status: 'success',
      cancelled: false,
      timedOut: false,
      rolledBack: false,
      finalBytes: new Uint8Array([9, 9]),
      selectedPages: [1, 2],
      outputFiles: [],
      logs: ['Workflow executed.'],
      stepResults: [],
    });
  });

  it('Test Run performs dry-run preflight without executing the session runner', async () => {
    render(
      <MacroBuilderExecutionPanel
        recipe={recipe}
        validationValid
      />,
    );

    fireEvent.click(screen.getByTestId('macro-builder-test-run'));

    await waitFor(() => {
      expect(screen.getByTestId('macro-builder-preflight')).toBeInTheDocument();
    });

    expect(validateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'builder-execution',
        dryRun: true,
      }),
      expect.objectContaining({
        pageCount: 2,
        fileName: 'builder-execution.pdf',
      }),
    );
    expect(runMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Test Run complete/i)).toBeInTheDocument();
    expect(screen.getByText('2 → 2')).toBeInTheDocument();
  });

  it('Run requires a valid preflight and then executes a non-dry-run workflow', async () => {
    render(
      <MacroBuilderExecutionPanel
        recipe={recipe}
        validationValid
      />,
    );

    fireEvent.click(screen.getByTestId('macro-builder-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'builder-execution',
        dryRun: false,
      }),
      expect.objectContaining({
        saveOutputs: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );

    expect(screen.getByText(/active document was updated/i)).toBeInTheDocument();
  });

  it('blocks Run when preflight reports an error', async () => {
    validateMock.mockResolvedValueOnce({
      isValid: false,
      errors: ['Missing donor file ID donorA'],
      warnings: [],
      dryRunLogs: [],
    });

    render(
      <MacroBuilderExecutionPanel
        recipe={recipe}
        validationValid
      />,
    );

    fireEvent.click(screen.getByTestId('macro-builder-run'));

    await waitFor(() => {
      expect(screen.getByText(/Fix the preflight issues/i)).toBeInTheDocument();
    });

    expect(runMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Missing donor file ID donorA/)).toBeInTheDocument();
  });

  it('disables Test Run and Run when there is no open PDF', () => {
    useSessionStore.getState().clearDocument();

    render(
      <MacroBuilderExecutionPanel
        recipe={recipe}
        validationValid
      />,
    );

    expect(screen.getByTestId('macro-builder-test-run')).toBeDisabled();
    expect(screen.getByTestId('macro-builder-run')).toBeDisabled();
    expect(screen.getByText(/Open a PDF to test or run/i)).toBeInTheDocument();
  });
});
