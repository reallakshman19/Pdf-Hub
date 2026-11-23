import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OcrStructuredExportPanel } from '../OcrStructuredExportPanel';
import type { OcrDocumentResult } from '@/core/ocr/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

describe('OcrStructuredExportPanel', () => {
  const sampleResult: OcrDocumentResult = {
    documentFingerprint: 'test-fingerprint-123',
    createdAt: '2026-11-23T00:00:00.000Z',
    engineId: 'tesseract.js',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        status: 'complete',
        pageIndex: 0,
        pageNumber: 1,
        blocks: [
          {
            id: 'h1',
            type: 'heading',
            text: 'Quarterly Financial Summary',
            rect: { x: 50, y: 50, width: 400, height: 30 },
          },
          {
            id: 'p1',
            type: 'paragraph',
            text: 'Net revenue increased by 14% year over year.',
            rect: { x: 50, y: 90, width: 400, height: 30 },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    useWriterV2Store.setState({
      elements: [],
      selectedIds: [],
    });
    vi.clearAllMocks();
  });

  it('renders empty state when no OCR result is provided', () => {
    render(<OcrStructuredExportPanel ocrResult={null} />);
    expect(screen.getByTestId('ocr-structured-export-panel-empty')).toBeTruthy();
  });

  it('renders export panel and switches format tabs', () => {
    render(<OcrStructuredExportPanel ocrResult={sampleResult} />);

    expect(screen.getByTestId('ocr-structured-export-panel')).toBeTruthy();
    const preview = screen.getByTestId('ocr-export-preview');

    // Default tab is markdown
    expect(preview.textContent).toContain('Quarterly Financial Summary');

    // Switch to Plain Text
    fireEvent.click(screen.getByTestId('ocr-export-tab-text'));
    expect(screen.getByTestId('ocr-export-tab-text')).toBeTruthy();

    // Switch to JSON AST
    fireEvent.click(screen.getByTestId('ocr-export-tab-json'));
    expect(preview.textContent).toContain('"schemaVersion": "pdfhub-ocr-ast-v1"');
  });

  it('handles copy to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<OcrStructuredExportPanel ocrResult={sampleResult} />);

    fireEvent.click(screen.getByTestId('ocr-export-copy-btn'));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(screen.getByTestId('ocr-export-status-message')).toHaveTextContent('copied to clipboard');
    });
  });

  it('triggers browser file download on Download button click', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(<OcrStructuredExportPanel ocrResult={sampleResult} />);

    fireEvent.click(screen.getByTestId('ocr-export-download-btn'));

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(screen.getByTestId('ocr-export-status-message')).toHaveTextContent('Downloaded MD file');
  });

  it('sends document to Writer V2 store or custom callback', async () => {
    const onInsertMock = vi.fn().mockResolvedValue(undefined);

    render(
      <OcrStructuredExportPanel
        ocrResult={sampleResult}
        documentFingerprint="test-fingerprint-123"
        onInsertWriterElements={onInsertMock}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-export-send-writer-btn'));

    await waitFor(() => {
      expect(onInsertMock).toHaveBeenCalled();
      const insertedElements = onInsertMock.mock.calls[0][0];
      expect(insertedElements).toHaveLength(2);
      expect(insertedElements[0].plainText).toBe('Quarterly Financial Summary');
      expect(screen.getByTestId('ocr-export-status-message')).toHaveTextContent('Sent 2 element(s)');
    });
  });
});
