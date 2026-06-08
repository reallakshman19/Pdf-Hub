import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { OcrPanelWriterConnected } from '../OcrPanelWriterConnected';

const explicitPages: OcrJobRunnerPageInput[] = [
  {
    pageIndex: 0,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
    imageCount: 1,
  },
];

describe('OcrBrowserWorkflow', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'workflow-doc',
      elements: [],
      assetRecords: [],
      persistedAt: null,
    });
    useSessionStore.getState().openDocument({
      documentKey: 'workflow-doc',
      fileName: 'workflow.pdf',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      pageCount: 5,
    });
    useSessionStore.getState().setSelectedPages([1]);
  });

  it('runs source to review to Writer and searchable export workflow', async () => {
    render(<OcrPanelWriterConnected pages={explicitPages} />);

    const header = screen.getByTestId('ocr-header-summary');
    const sourcePanel = screen.getByTestId('ocr-source-panel') as HTMLDetailsElement;
    const advancedPanel = screen.getByTestId('ocr-advanced-panel') as HTMLDetailsElement;

    expect(screen.getByTestId('ocr-assistant-shell')).toBeTruthy();
    expect(screen.queryByTestId('ocr-unified-panel')).toBeNull();
    expect(within(header).getByText(/workflow\.pdf/)).toBeTruthy();
    expect(within(header).getByText(/5 pages/)).toBeTruthy();
    expect(header.textContent).toContain('1 selected');
    expect(screen.getAllByTestId('ocr-run-section')).toHaveLength(1);
    expect(screen.getByTestId('run-ocr-button')).toBeTruthy();
    expect(sourcePanel.open).toBe(false);
    expect(advancedPanel.open).toBe(false);
    expect(screen.getByText(/Run OCR first to export a searchable PDF/i)).toBeTruthy();
    expect(screen.queryByTestId('ocr-searchable-pdf-export-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(screen.getByTestId('ocr-result-workspace')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-search')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-corrections')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-region-tools')).toBeTruthy();
    expect(screen.getByTestId('ocr-searchable-pdf-export-panel')).toBeTruthy();
    expect(advancedPanel.open).toBe(false);

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: { value: 'text' },
    });
    fireEvent.click(screen.getByTestId('ocr-region-add'));
    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('ocr-region-output-mode'), {
      target: { value: 'richTextBox' },
    });
    fireEvent.click(screen.getByTestId('ocr-region-convert'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-writer-insert-panel')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements).toHaveLength(1);
    });

    expect(useWriterV2Store.getState().elements[0].type).toBe('richTextBox');
    expect(screen.getByTestId('ocr-writer-connected-summary')).toBeTruthy();
  });
});
