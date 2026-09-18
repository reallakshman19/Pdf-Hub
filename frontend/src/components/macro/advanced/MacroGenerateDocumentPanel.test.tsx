import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { useSessionStore } from '@/core/session/store';
import { MacroGenerateDocumentPanel } from './MacroGenerateDocumentPanel';

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

describe('MacroGenerateDocumentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clearDocument();
    useSessionStore.getState().openDocument({
      documentKey: 'generate-panel-doc',
      fileName: 'source.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 3,
    });

    runMock.mockResolvedValue({
      success: true,
      status: 'success',
      outputFiles: [],
      stepResults: [],
      finalBytes: new Uint8Array([9, 8, 7]),
      logs: ['Generated document.'],
      selectedPages: [],
    });
  });

  it('renders template-driven generation fields', () => {
    render(<MacroGenerateDocumentPanel />);

    expect(screen.getByLabelText('Generate Document Template')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Title/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/templates available/i)).toBeInTheDocument();
  });

  it('forces real execution and hands fallback output to the parent', async () => {
    const onOutputsProduced = vi.fn();

    render(
      <MacroGenerateDocumentPanel
        onOutputsProduced={onOutputsProduced}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-generate-run'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
      }),
      expect.objectContaining({
        saveOutputs: false,
      }),
    );

    await waitFor(() => {
      expect(onOutputsProduced).toHaveBeenCalledWith([
        expect.objectContaining({
          bytes: new Uint8Array([9, 8, 7]),
        }),
      ]);
    });
  });

  it('passes macro-produced output files through unchanged', async () => {
    const onOutputsProduced = vi.fn();
    runMock.mockResolvedValueOnce({
      success: true,
      status: 'success',
      outputFiles: [
        {
          name: 'generated-report.pdf',
          bytes: new Uint8Array([5]),
        },
      ],
      stepResults: [],
      finalBytes: new Uint8Array([9]),
      logs: ['Generated output.'],
      selectedPages: [],
    });

    render(
      <MacroGenerateDocumentPanel
        onOutputsProduced={onOutputsProduced}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-generate-run'));

    await waitFor(() => {
      expect(onOutputsProduced).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'generated-report.pdf',
        }),
      ]);
    });
  });

  it('reports busy state for the full generation run', async () => {
    const onBusyChange = vi.fn();

    render(
      <MacroGenerateDocumentPanel
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByTestId('macro-generate-run'));

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('keeps execution disabled when another workflow owns the compatibility surface', () => {
    render(<MacroGenerateDocumentPanel disabled />);

    expect(screen.getByTestId('macro-generate-run')).toBeDisabled();
    expect(screen.getByLabelText('Generate Document Template')).toBeDisabled();
  });
});
