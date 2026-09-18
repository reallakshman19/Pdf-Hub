import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type { MacroRecipe } from '@/core/macro/types';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { MacroPresetExecutionPanel } from './MacroPresetExecutionPanel';

vi.mock('@/core/macro/sessionRunner', () => ({
  runMacroRecipeAgainstSession: vi.fn(),
}));

vi.mock('@/core/logger/service', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const runMock = vi.mocked(runMacroRecipeAgainstSession);

const safeRecipe: MacroRecipe = {
  id: 'safe-preset',
  name: 'Safe Preset',
  steps: [
    {
      op: 'rotate_pages',
      selector: { mode: 'current' },
      degrees: 90,
    },
  ],
};

const destructiveRecipe: MacroRecipe = {
  id: 'destructive-preset',
  name: 'Destructive Preset',
  steps: [
    {
      op: 'remove_pages',
      selector: { mode: 'selected' },
    },
  ],
};

describe('MacroPresetExecutionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clearDocument();
    useSessionStore.getState().openDocument({
      documentKey: 'preset-runner-doc',
      fileName: 'preset.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 3,
    });
    useSessionStore.getState().setSelectedPages([2]);

    runMock.mockResolvedValue({
      success: true,
      status: 'success',
      outputFiles: [],
      stepResults: [],
      finalBytes: new Uint8Array([9]),
      logs: ['Workflow executed.'],
      selectedPages: [2],
    });
  });

  it('runs safe presets through preflight and forces non-dry-run execution', async () => {
    render(<MacroPresetExecutionPanel recipe={safeRecipe} />);

    fireEvent.click(screen.getByTestId('macro-preset-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'safe-preset',
        dryRun: false,
      }),
      expect.objectContaining({
        saveOutputs: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('requires Test Run before destructive preset execution', async () => {
    render(<MacroPresetExecutionPanel recipe={destructiveRecipe} />);

    expect(screen.getByTestId('macro-preset-preview-required')).toBeInTheDocument();
    expect(screen.getByTestId('macro-preset-run')).toBeDisabled();

    fireEvent.click(screen.getByTestId('macro-preset-test-run'));

    await waitFor(() => {
      expect(screen.getByText('Test Run passed')).toBeInTheDocument();
    });

    expect(screen.getByTestId('macro-preset-run')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('macro-preset-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });
  });

  it('invalidates destructive preview after a parameter/recipe change', async () => {
    const { rerender } = render(
      <MacroPresetExecutionPanel recipe={destructiveRecipe} />,
    );

    fireEvent.click(screen.getByTestId('macro-preset-test-run'));

    await waitFor(() => {
      expect(screen.getByTestId('macro-preset-run')).not.toBeDisabled();
    });

    rerender(
      <MacroPresetExecutionPanel
        recipe={{
          ...destructiveRecipe,
          name: 'Changed Destructive Preset',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('macro-preset-run')).toBeDisabled();
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('reports busy state across preflight and execution', async () => {
    const onBusyChange = vi.fn();

    render(
      <MacroPresetExecutionPanel
        recipe={safeRecipe}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-preset-run'));

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('hands output files to the shared parent queue', async () => {
    const onOutputsProduced = vi.fn();
    runMock.mockResolvedValueOnce({
      success: true,
      status: 'success',
      outputFiles: [
        {
          name: 'preset-output.pdf',
          bytes: new Uint8Array([7]),
        },
      ],
      stepResults: [],
      finalBytes: new Uint8Array([9]),
      logs: ['Created output.'],
      selectedPages: [2],
    });

    render(
      <MacroPresetExecutionPanel
        recipe={safeRecipe}
        onOutputsProduced={onOutputsProduced}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-preset-run'));

    await waitFor(() => {
      expect(onOutputsProduced).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'preset-output.pdf',
        }),
      ]);
    });
  });

  it('delegates preset saving but keeps run-state reset local', async () => {
    const onSavePreset = vi.fn();

    render(
      <MacroPresetExecutionPanel
        recipe={destructiveRecipe}
        onSavePreset={onSavePreset}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));
    expect(onSavePreset).toHaveBeenCalledWith(destructiveRecipe);

    fireEvent.click(screen.getByTestId('macro-preset-test-run'));
    await waitFor(() => {
      expect(screen.getByText('Test Run passed')).toBeInTheDocument();
      expect(screen.getByTestId('macro-preset-run')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear Run State' }));

    expect(screen.queryByText('Test Run passed')).toBeNull();
    expect(screen.getByTestId('macro-preset-run')).toBeDisabled();
  });
});
