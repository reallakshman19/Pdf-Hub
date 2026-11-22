import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { runGenerationRecipeOnSnapshot } from '@/core/macro/generateDocument/runIsolatedGeneration';
import { useSessionStore } from '@/core/session/store';
import { MacroGenerateDocumentPanel } from './MacroGenerateDocumentPanel';

vi.mock('@/core/macro/generateDocument/runIsolatedGeneration', () => ({
  runGenerationRecipeOnSnapshot: vi.fn(),
}));

vi.mock('@/core/logger/service', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const runMock = vi.mocked(runGenerationRecipeOnSnapshot);

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
        fileName: 'source.pdf',
        pageCount: 3,
        workingBytes: new Uint8Array([1, 2, 3]),
      }),
      expect.any(AbortSignal),
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
  it('does not run the generator when a required title is blank', async () => {
    render(<MacroGenerateDocumentPanel />);
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('macro-generate-run'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Complete required field: Title.');
    expect(runMock).not.toHaveBeenCalled();
  });

  it('names a fallback output using the submitted record title', async () => {
    const onOutputsProduced = vi.fn();
    render(<MacroGenerateDocumentPanel onOutputsProduced={onOutputsProduced} />);
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Alpha Valve' },
    });
    fireEvent.click(screen.getByTestId('macro-generate-run'));

    await waitFor(() => {
      expect(onOutputsProduced).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'professional-report-alpha-valve.pdf' }),
      ]);
    });
  });

  it('exposes cancellation and does not publish cancelled output', async () => {
    const onOutputsProduced = vi.fn();
    runMock.mockImplementationOnce(async (_recipe, _snapshot, signal) => new Promise((resolve) => {
      signal?.addEventListener('abort', () => {
        resolve({
          success: false,
          status: 'cancelled',
          outputFiles: [],
          stepResults: [],
          finalBytes: new Uint8Array([1]),
          logs: ['Cancelled.'],
          selectedPages: [],
        });
      }, { once: true });
    }));

    render(<MacroGenerateDocumentPanel onOutputsProduced={onOutputsProduced} />);
    fireEvent.click(screen.getByTestId('macro-generate-run'));
    await waitFor(() => expect(runMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTestId('macro-generate-cancel'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Generate Document was cancelled.');
    expect(onOutputsProduced).not.toHaveBeenCalled();
  });
  it('generates two independent records without changing the active PDF', async () => {
    const onOutputsProduced = vi.fn();
    render(<MacroGenerateDocumentPanel onOutputsProduced={onOutputsProduced} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Alpha Valve' } });
    fireEvent.click(screen.getByTestId('macro-generate-run'));
    await waitFor(() => expect(onOutputsProduced).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Beta Pump' } });
    fireEvent.click(screen.getByTestId('macro-generate-run'));
    await waitFor(() => expect(onOutputsProduced).toHaveBeenCalledTimes(2));
    expect(runMock).toHaveBeenCalledTimes(2);
    for (const [, snapshot] of runMock.mock.calls) {
      expect(snapshot.workingBytes).toEqual(new Uint8Array([1, 2, 3]));
      expect(snapshot.pageCount).toBe(3);
    }
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(onOutputsProduced.mock.calls[0]?.[0][0].name)
      .toBe('professional-report-alpha-valve.pdf');
    expect(onOutputsProduced.mock.calls[1]?.[0][0].name)
      .toBe('professional-report-beta-pump.pdf');
  });

  it.each([false, true])('discards output after a document switch (restored=%s)', async (restoreSource) => {
    const source = useSessionStore.getState();
    const onOutputsProduced = vi.fn();
    let finish!: (value: Awaited<ReturnType<typeof runGenerationRecipeOnSnapshot>>) => void;
    runMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<MacroGenerateDocumentPanel onOutputsProduced={onOutputsProduced} />);
    fireEvent.click(screen.getByTestId('macro-generate-run'));
    await waitFor(() => expect(runMock).toHaveBeenCalledOnce());
    act(() => {
      useSessionStore.getState().openDocument({
        documentKey: 'replacement-doc',
        fileName: 'replacement.pdf',
        bytes: new Uint8Array([4, 5, 6]),
        pageCount: 1,
      });
      if (restoreSource) useSessionStore.setState(source);
    });
    finish({
      success: true, status: 'success', outputFiles: [], stepResults: [],
      finalBytes: new Uint8Array([9, 8]), logs: [], selectedPages: [],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Source PDF changed during generation');
    expect(onOutputsProduced).not.toHaveBeenCalled();
  });

});
