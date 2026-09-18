import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { MacroBatchRunPanel } from './MacroBatchRunPanel';

const fileMocks = vi.hoisted(() => ({
  pickPdfFileSources: vi.fn(),
  downloadBytes: vi.fn(),
}));

const batchMocks = vi.hoisted(() => ({
  runMacroBatch: vi.fn(),
}));

const downloadMocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    pickPdfFileSources: fileMocks.pickPdfFileSources,
    downloadBytes: fileMocks.downloadBytes,
  },
}));

vi.mock('@/core/macro/batchRunner', () => ({
  runMacroBatch: batchMocks.runMacroBatch,
}));

vi.mock('@/core/document/download', () => ({
  downloadBlob: downloadMocks.downloadBlob,
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (
    selector: (state: { addToast: typeof toastMocks.addToast }) => unknown,
  ) => selector({ addToast: toastMocks.addToast }),
}));

vi.mock('@/components/dialogs/BatchRunDialog', () => ({
  BatchRunDialog: ({
    isOpen,
    disabled,
    onClose,
    onConfirm,
  }: {
    isOpen: boolean;
    disabled?: boolean;
    onClose: () => void;
    onConfirm: (recipe: {
      id: string;
      name: string;
      steps: [];
    }) => void;
  }) => isOpen ? (
    <div data-testid="batch-dialog">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onConfirm({
            id: 'review-current-page',
            name: 'Review Current Page',
            steps: [],
          });
          onClose();
        }}
      >
        Run Selected Batch
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onClose}
      >
        Close Batch Dialog
      </button>
    </div>
  ) : null,
}));

function completedReport() {
  return {
    outcome: 'completed',
    cancelled: false,
    records: [],
    summary: {
      selected: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      notRun: 0,
    },
    metadata: {
      recipeId: 'review-current-page',
      startedAt: '2026-09-18T00:00:00.000Z',
      endedAt: '2026-09-18T00:00:01.000Z',
    },
    evidence: {
      profileId: 'BATCH_PDF',
    },
  };
}

describe('MacroBatchRunPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fileMocks.pickPdfFileSources.mockResolvedValue([
      {
        file: new File(
          [new Uint8Array([1, 2, 3])],
          'drawing.pdf',
          { type: 'application/pdf' },
        ),
      },
    ]);

    batchMocks.runMacroBatch.mockImplementation(
      async (options: {
        onOutput?: (output: {
          inputIndex: number;
          fileName: string;
          bytes: Uint8Array;
        }) => void | Promise<void>;
      }) => {
        await options.onOutput?.({
          inputIndex: 0,
          fileName: 'drawing.pdf',
          bytes: new Uint8Array([9, 8, 7]),
        });
        return completedReport();
      },
    );
  });

  it('opens workflow selection from the Automate batch card', () => {
    render(<MacroBatchRunPanel />);

    expect(screen.queryByTestId('batch-dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));

    expect(screen.getByTestId('batch-dialog')).toBeInTheDocument();
  });

  it('downloads each processed PDF and then the metadata report', async () => {
    render(<MacroBatchRunPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected Batch' }));

    await waitFor(() => {
      expect(fileMocks.downloadBytes).toHaveBeenCalledWith(
        new Uint8Array([9, 8, 7]),
        '001-drawing-review-current-page.pdf',
      );
    });

    expect(downloadMocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(toastMocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Batch Run Complete',
      }),
    );
  });

  it('reports busy state for the full batch operation', async () => {
    const onBusyChange = vi.fn();

    render(
      <MacroBatchRunPanel onBusyChange={onBusyChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected Batch' }));

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('does not open workflow selection while another Automate workflow is active', () => {
    render(<MacroBatchRunPanel disabled />);

    const button = screen.getByRole('button', { name: 'Choose Workflow' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(screen.queryByTestId('batch-dialog')).toBeNull();
  });
});
