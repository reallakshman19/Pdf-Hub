import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type { MacroRecipe } from '@/core/macro/types';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { usePresetsStore } from '@/core/macro/store/presets';
import { MacroExpertWorkspace } from './MacroExpertWorkspace';

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
  id: 'safe-expert',
  name: 'Safe Expert',
  steps: [
    {
      op: 'header_footer_text',
      selector: { mode: 'all' },
      zone: 'footer',
      text: 'Page {{page}}',
      align: 'center',
      marginX: 24,
      marginY: 20,
      fontSize: 9,
    },
  ],
};

const destructiveRecipe: MacroRecipe = {
  id: 'destructive-expert',
  name: 'Destructive Expert',
  steps: [
    {
      op: 'remove_pages',
      selector: { mode: 'selected' },
    },
  ],
};

describe('MacroExpertWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSessionStore.getState().clearDocument();
    useSessionStore.getState().openDocument({
      documentKey: 'expert-workflow-doc',
      fileName: 'expert.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 3,
    });
    useSessionStore.getState().setSelectedPages([2]);

    usePresetsStore.setState({
      savedPresets: [],
    });

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

  it('renders human-readable action labels instead of raw operation IDs', () => {
    render(<MacroExpertWorkspace selectedRecipe={safeRecipe} />);

    expect(screen.getByText('Header/Footer Text')).toBeInTheDocument();
    expect(screen.queryByText('header_footer_text')).toBeNull();
  });

  it('forces a real non-dry-run recipe when Run Expert executes', async () => {
    render(<MacroExpertWorkspace selectedRecipe={safeRecipe} />);

    fireEvent.click(screen.getByTestId('macro-expert-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'safe-expert',
        dryRun: false,
      }),
      expect.objectContaining({
        saveOutputs: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('requires Validate + Dry Run before a destructive raw workflow can run', async () => {
    render(<MacroExpertWorkspace selectedRecipe={destructiveRecipe} />);

    expect(screen.getByText(/Preview required/i)).toBeInTheDocument();

    expect(screen.getByTestId('macro-expert-run')).toBeDisabled();
    expect(runMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('macro-expert-test-run'));

    await waitFor(() => {
      expect(screen.getByText('Expert preflight passed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('macro-expert-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });
  });

  it('invalidates destructive preview when the raw JSON changes', async () => {
    render(<MacroExpertWorkspace selectedRecipe={destructiveRecipe} />);

    fireEvent.click(screen.getByTestId('macro-expert-test-run'));

    await waitFor(() => {
      expect(screen.getByText('Expert preflight passed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

    const json = screen.getByLabelText('Expert workflow JSON');
    const edited: MacroRecipe = {
      ...destructiveRecipe,
      name: 'Destructive Expert Edited',
    };

    fireEvent.change(json, {
      target: {
        value: JSON.stringify(edited, null, 2),
      },
    });

    expect(screen.getByTestId('macro-expert-run')).toBeDisabled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('hands generated output files back to the parent queue', async () => {
    const onOutputsProduced = vi.fn();
    runMock.mockResolvedValueOnce({
      success: true,
      status: 'success',
      outputFiles: [
        {
          name: 'expert-output.pdf',
          bytes: new Uint8Array([5, 6, 7]),
        },
      ],
      stepResults: [],
      finalBytes: new Uint8Array([9]),
      logs: ['Generated output.'],
      selectedPages: [2],
    });

    render(
      <MacroExpertWorkspace
        selectedRecipe={safeRecipe}
        onOutputsProduced={onOutputsProduced}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-expert-run'));

    await waitFor(() => {
      expect(onOutputsProduced).toHaveBeenCalledTimes(1);
    });

    expect(onOutputsProduced).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'expert-output.pdf',
      }),
    ]);
  });

  it('saves parsed expert source through the shared presets store', () => {
    render(<MacroExpertWorkspace selectedRecipe={safeRecipe} />);

    fireEvent.change(screen.getByPlaceholderText('Expert preset name'), {
      target: {
        value: 'Saved Expert Workflow',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));

    expect(usePresetsStore.getState().savedPresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'safe-expert',
          name: 'Saved Expert Workflow',
        }),
      ]),
    );
  });
});
