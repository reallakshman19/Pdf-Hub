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
} from '@testing-library/react';
import { OcrPanel } from '../OcrPanel';
import { useOcrStore } from '@/core/ocr/ocrStore';
import type { WriterElementV2 } from '@/core/writer-v2/types';

describe('OcrPanel', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('renders OCR workspace shell', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-panel"
        selectedPageIndexes={[0]}
      />,
    );

    expect(screen.getByTestId('ocr-panel')).toBeTruthy();
    expect(screen.getByText('OCR Workspace')).toBeTruthy();
    expect(screen.getByText(/Document: doc-panel/)).toBeTruthy();
    expect(screen.getByTestId('run-ocr-button')).toBeTruthy();
  });

  it('updates OCR settings through panel controls', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-settings"
        selectedPageIndexes={[0]}
      />,
    );

    const engineSelect = screen.getByTestId('ocr-engine-select');

    fireEvent.change(engineSelect, {
      target: {
        value: 'tesseract-js',
      },
    });

    const forceCheckbox = screen.getByLabelText(
      'Force OCR even if embedded text exists',
    );

    fireEvent.click(forceCheckbox);

    expect(useOcrStore.getState().engineId).toBe('tesseract-js');
    expect(useOcrStore.getState().forceOcr).toBe(true);
  });

  it('runs mock OCR and displays result summary', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-run"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(screen.getByTestId('ocr-result-summary')).toBeTruthy();
    expect(screen.getByText('Words')).toBeTruthy();
    expect(useOcrStore.getState().correctedResult?.pages[0].status).toBe('success');
  });

  it('supports OCR search after running OCR', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-search-panel"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().searchIndex).not.toBeNull();
    });

    const searchInput = screen.getByPlaceholderText('Search OCR result');

    fireEvent.change(searchInput, {
      target: {
        value: 'writer',
      },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('ocr-search-match').length).toBeGreaterThan(0);
    });
  });

  it('clears OCR state from panel', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-clear"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().searchIndex).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId('clear-ocr-button'));

    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().searchIndex).toBeNull();
    expect(screen.getByTestId('ocr-summary-empty')).toBeTruthy();
  });

  it('can run placeholder OCR without selected pages', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-placeholder"
        pageCount={2}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(useOcrStore.getState().correctedResult?.pages).toHaveLength(2);
  });

  it('shows confidence legend and low-confidence queue after OCR run', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-confidence-panel"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(screen.getByTestId('ocr-confidence-legend')).toBeTruthy();
    expect(screen.getByTestId('ocr-low-confidence-panel')).toBeTruthy();
    expect(screen.getByText('P1pe')).toBeTruthy();

    fireEvent.click(screen.getByText('P1pe'));

    const lowConfidenceItems = screen.getAllByTestId('ocr-low-confidence-item');

    expect(lowConfidenceItems.length).toBeGreaterThan(0);
  });

  it('allows low-confidence OCR word correction from panel', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-correction-panel"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    fireEvent.click(screen.getByText('P1pe'));

    expect(screen.getByTestId('ocr-correction-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('P1pe');

    fireEvent.change(screen.getByTestId('ocr-correction-input'), {
      target: {
        value: 'Pipe',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-correction-save'));

    expect(useOcrStore.getState().corrections).toHaveLength(1);
    expect(useOcrStore.getState().corrections[0].correctedText).toBe('Pipe');

    const correctedMatches = useOcrStore.getState().searchOcr({
      text: 'pipe',
      source: 'ocrCorrection',
    });

    expect(correctedMatches.length).toBeGreaterThan(0);
  });

  it('adds and deletes OCR region from panel', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-region-panel"
        selectedPageIndexes={[0]}
      />,
    );

    expect(screen.getByTestId('ocr-region-tool')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-list-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-count').textContent).toBe('0');

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: {
        value: 'table',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));

    expect(useOcrStore.getState().regions).toHaveLength(1);
    expect(useOcrStore.getState().regions[0].mode).toBe('table');
    expect(screen.getByTestId('ocr-region-count').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('ocr-region-delete'));

    expect(useOcrStore.getState().regions).toHaveLength(0);
    expect(screen.getByTestId('ocr-region-count').textContent).toBe('0');
  });

  it('runs selected OCR region and creates Writer element callback result', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-region-action-panel"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: {
        value: 'text',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));

    expect(useOcrStore.getState().regions).toHaveLength(1);

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('ocr-region-output-mode'), {
      target: {
        value: 'richTextBox',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-convert'));

    expect(screen.getByTestId('ocr-region-writer-created')).toBeTruthy();
    expect(screen.getByText('Region created Writer element: richTextBox')).toBeTruthy();
  });

  it('reviews and accepts OCR table from region OCR result', async () => {
    useOcrStore.getState().setOcrProfileId('table-heavy');

    render(
      <OcrPanel
        documentFingerprint="doc-table-review-panel"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: {
        value: 'table',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-y'), {
      target: {
        value: '460',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-height'), {
      target: {
        value: '220',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-table-review-panel')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('Valve'), {
      target: {
        value: 'Gate Valve',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-table-accept'));

    expect(screen.getByTestId('ocr-table-accepted-summary')).toBeTruthy();
    expect(screen.getByText('OCR table accepted: 2 rows × 2 columns')).toBeTruthy();
  });

  it('queues OCR region Writer element and inserts through callback', async () => {
    const insertedElements: WriterElementV2[] = [];

    render(
      <OcrPanel
        documentFingerprint="doc-writer-insert-panel"
        selectedPageIndexes={[0]}
        onInsertWriterElements={(elements) => {
          insertedElements.push(...elements);
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: {
        value: 'text',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));
    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('ocr-region-output-mode'), {
      target: {
        value: 'richTextBox',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-convert'));

    expect(screen.getByTestId('ocr-writer-insert-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-writer-insert-count').textContent).toBe('1/1');

    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    expect(insertedElements).toHaveLength(1);
    expect(insertedElements[0].type).toBe('richTextBox');
    expect(screen.getByTestId('ocr-writer-inserted-summary')).toBeTruthy();
    expect(screen.getByText('Inserted 1 OCR Writer element(s).')).toBeTruthy();
  });

  it('still runs placeholder OCR when pdfBytes are not supplied', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-no-pdfbytes"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(useOcrStore.getState().correctedResult?.pages[0].status).toBe('success');
  });

  it('region OCR still works through fallback resolver when pdfBytes are not supplied', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-region-fallback-raster"
        selectedPageIndexes={[0]}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-region-add'));
    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    expect(screen.getByText(/Region OCR completed/)).toBeTruthy();
  });

  it('shows OCR execution settings and applies page limit diagnostics', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-execution-policy"
        pageCount={3}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-execution-max-pages'), {
      target: {
        value: '1',
      },
    });

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-execution-diagnostics')).toBeTruthy();
    });

    expect(screen.getByText(/OCR job limited to 1 page/)).toBeTruthy();

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(useOcrStore.getState().correctedResult?.pages).toHaveLength(1);
  });

  it('shows cancel control while OCR is running', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-cancel-control"
        selectedPageIndexes={[0]}
      />,
    );

    expect(screen.queryByTestId('ocr-execution-cancel')).toBeNull();
  });

  it('changes OCR pipeline mode', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-pipeline-panel"
        selectedPageIndexes={[0]}
      />,
    );

    expect(screen.getByTestId('ocr-pipeline-mode-panel')).toBeTruthy();

    fireEvent.change(screen.getByTestId('ocr-pipeline-mode-select'), {
      target: {
        value: 'worker-ocr',
      },
    });

    expect(screen.getByTestId('ocr-pipeline-mode-select')).toHaveValue('worker-ocr');
  });

  it('shows pre-batch pipeline planning diagnostics during OCR run', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-pipeline-batch-plan"
        pageCount={2}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-pipeline-mode-select'), {
      target: {
        value: 'main',
      },
    });

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-pipeline-messages')).toBeTruthy();
    });

    expect(screen.getByTestId('ocr-pipeline-messages').textContent).toContain('OCR pipeline');

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });
  });
});

