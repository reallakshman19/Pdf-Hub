import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  createOcrBatchSchedulerSnapshot,
  createOcrBatchTasksFromPages,
} from '@/core/ocr/ocrBatchScheduler';
import type { OcrEnginePageInput } from '@/core/ocr/engines/ocrEngineContract';
import { OcrBatchQueuePanel } from '../OcrBatchQueuePanel';

describe('OcrBatchQueuePanel', () => {
  it('renders empty state', () => {
    render(
      <OcrBatchQueuePanel snapshot={null} />,
    );

    expect(screen.getByTestId('ocr-batch-queue-empty')).toBeTruthy();
  });

  it('renders batch queue snapshot', () => {
    const tasks = createTasks(3);
    tasks[0].status = 'completed';
    tasks[1].status = 'running';

    const snapshot = createOcrBatchSchedulerSnapshot(tasks);

    render(
      <OcrBatchQueuePanel snapshot={snapshot} />,
    );

    expect(screen.getByTestId('ocr-batch-queue-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-batch-status').textContent).toBe('running');
    expect(screen.getAllByTestId('ocr-batch-task-row')).toHaveLength(3);
    expect(screen.getAllByTestId('ocr-batch-task-status')[0].textContent).toBe('completed');
  });

  it('calls cancel when queue is running', () => {
    let cancelled = false;

    const tasks = createTasks(2);
    tasks[0].status = 'running';

    render(
      <OcrBatchQueuePanel
        snapshot={createOcrBatchSchedulerSnapshot(tasks)}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-batch-cancel'));

    expect(cancelled).toBe(true);
  });

  it('calls retry when failed tasks exist', () => {
    let retried = false;

    const tasks = createTasks(2);
    tasks[0].status = 'failed';
    tasks[0].errorMessage = 'Failed OCR batch.';
    tasks[1].status = 'completed';

    render(
      <OcrBatchQueuePanel
        snapshot={createOcrBatchSchedulerSnapshot(tasks)}
        onRetryFailed={() => {
          retried = true;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-batch-retry'));

    expect(retried).toBe(true);
    expect(screen.getByText('Failed OCR batch.')).toBeTruthy();
  });

  it('disables retry when no failed tasks exist', () => {
    const tasks = createTasks(1);
    tasks[0].status = 'completed';

    render(
      <OcrBatchQueuePanel
        snapshot={createOcrBatchSchedulerSnapshot(tasks)}
        onRetryFailed={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-batch-retry')).toBeDisabled();
  });
});

function createTasks(count: number) {
  return createOcrBatchTasksFromPages({
    pages: makePages(count),
    batchSize: 1,
    idPrefix: 'panel-batch',
  });
}

function makePages(count: number): OcrEnginePageInput[] {
  return Array.from({ length: count }, (_, pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
  }));
}
