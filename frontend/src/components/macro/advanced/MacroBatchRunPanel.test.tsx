import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { MacroBatchRunPanel } from './MacroBatchRunPanel';
import { useMacroOutputQueueStore } from '@/core/macro/outputQueueStore';
import type { BatchOutputArtifact } from '@/core/macro/batchRunner';

const fileMocks = vi.hoisted(() => ({
  pickPdfFileSources: vi.fn(),
  downloadBytes: vi.fn(),
  hashBytes: vi.fn(async () => 'sha256:' + 'b'.repeat(64)),
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
    hashBytes: fileMocks.hashBytes,
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
      outputsPrepared: 1,
      outputsHandedOff: 1,
      failed: 0,
      cancelled: 0,
      notRun: 0,
    },
    metadata: {
      recipeId: 'review-current-page',
      runId: 'run-batch-fixture',
      recipeSha256: 'sha256:' + 'c'.repeat(64),
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
    useMacroOutputQueueStore.getState().clearOutputs();
    useMacroOutputQueueStore.getState().setLastBatchReport(null);

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
        onOutputs?: (outputs: readonly BatchOutputArtifact[]) => void | Promise<void>;
      }) => {
        await options.onOutputs?.([{
          outputIndex: 0,
          outputKind: 'working-copy',
          inputIndex: 0,
          fileName: 'drawing.pdf',
          inputPageCount: 1,
          sourceSha256: 'sha256:' + 'a'.repeat(64),
          outputSha256: 'sha256:' + 'b'.repeat(64),
          outputName: '001-drawing-review-current-page-aaaaaaaaaaaa.pdf',
          batchRunId: 'run-batch-fixture',
          recipeId: 'review-current-page',
          recipeSha256: 'sha256:' + 'c'.repeat(64),
          bytes: new Uint8Array([9, 8, 7]),
        }]);
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

  it('queues each processed PDF with source provenance and exposes the metadata report', async () => {
    render(<MacroBatchRunPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected Batch' }));

    await waitFor(() => {
      expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(1);
    });
    expect(fileMocks.downloadBytes).not.toHaveBeenCalled();
    expect(useMacroOutputQueueStore.getState().outputs[0]).toMatchObject({
      name: '001-drawing-review-current-page-aaaaaaaaaaaa.pdf',
      sourceKind: 'batch',
      sourceInputIndex: 0,
      sourceFileName: 'drawing.pdf',
      sourceSha256: 'sha256:' + 'a'.repeat(64),
      outputSha256: 'sha256:' + 'b'.repeat(64),
      sourceRecipeSha256: 'sha256:' + 'c'.repeat(64),
      sourceRecipeId: 'review-current-page',
      batchRunId: 'run-batch-fixture',
      bytes: new Uint8Array([9, 8, 7]),
    });
    expect(downloadMocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'batch-report-run-batch-fixture.json',
    );
    expect(screen.getByRole('button', { name: 'Download JSON Report Again' })).toBeVisible();
    expect(toastMocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Batch Run Complete',
        message: expect.stringContaining('queued for explicit saving'),
      }),
    );
  });


  it('preserves queued PDF bytes if the user later edits the macro output buffer', async () => {
    const sourceBytes = new Uint8Array([1, 2, 3]);
    batchMocks.runMacroBatch.mockImplementationOnce(async (options: {
      onOutputs?: (outputs: readonly BatchOutputArtifact[]) => void | Promise<void>;
    }) => {
      await options.onOutputs?.([{
        outputIndex: 0,
        outputKind: 'working-copy',
        inputIndex: 0,
        fileName: 'mutable.pdf',
        inputPageCount: 1,
        sourceSha256: 'sha256:' + '1'.repeat(64),
        outputSha256: 'sha256:' + 'b'.repeat(64),
        outputName: '001-mutable-fixture-111111111111.pdf',
        batchRunId: 'mutate-run',
        recipeId: 'fixture',
        recipeSha256: 'sha256:' + '3'.repeat(64),
        bytes: sourceBytes,
      }]);
      sourceBytes[0] = 99;
      return completedReport();
    });
    render(<MacroBatchRunPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected Batch' }));
    await waitFor(() => expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(1));
    expect(useMacroOutputQueueStore.getState().outputs[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
  });


  it('retains the metadata report when Automate tab unmounts and remounts the panel', async () => {
    const { unmount } = render(<MacroBatchRunPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Selected Batch' }));
    await waitFor(() => expect(useMacroOutputQueueStore.getState().lastBatchReport).not.toBeNull());
    unmount();
    render(<MacroBatchRunPanel />);
    expect(screen.getByRole('button', { name: 'Download JSON Report Again' })).toBeVisible();
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(1);
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
