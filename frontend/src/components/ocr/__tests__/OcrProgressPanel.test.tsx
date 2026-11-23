import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import type { OcrJob } from '@/core/ocr/ocrJobTypes';
import { OcrProgressPanel } from '../OcrProgressPanel';

describe('OcrProgressPanel', () => {
  it('renders empty state when no jobs are present', () => {
    render(<OcrProgressPanel jobs={[]} activeJobId={null} />);
    expect(screen.getByTestId('ocr-progress-empty')).toBeTruthy();
  });

  it('renders active job with ETA, batch info, and stage', () => {
    const mockJobs: OcrJob[] = [
      {
        id: 'job-12345678-abcd',
        documentKey: 'doc-key-1',
        pageNumbers: [1, 2, 3],
        results: [],
        queuedAt: Date.now(),
        cancelled: false,
        status: 'running',
        progress: {
          totalPages: 10,
          completedPages: 4,
          failedPages: 0,
          stage: 'recognizing',
          batchIndex: 0,
          totalBatches: 2,
          estimatedRemainingMs: 15_000,
        },
      },
    ];

    render(
      <OcrProgressPanel
        jobs={mockJobs}
        activeJobId="job-12345678-abcd"
      />,
    );

    expect(screen.getByTestId('ocr-progress-panel')).toBeTruthy();
    expect(screen.getByText('Job job-1234')).toBeTruthy();
    expect(screen.getByText('4/10 pages processed')).toBeTruthy();
    expect(screen.getByText('(Batch 1/2)')).toBeTruthy();
    expect(screen.getByText('recognizing')).toBeTruthy();
    expect(screen.getByTestId('ocr-job-eta').textContent).toContain('~15s remaining');
  });
});
