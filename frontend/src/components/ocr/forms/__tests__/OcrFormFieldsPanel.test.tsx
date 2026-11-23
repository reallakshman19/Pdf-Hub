import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OcrFormFieldsPanel } from '../OcrFormFieldsPanel';
import type { OcrDocumentResult } from '@/core/ocr/types';
import { getState, clearRegions } from '@/core/redaction/store';

describe('OcrFormFieldsPanel', () => {
  beforeEach(() => {
    clearRegions();
  });

  const mockOcrResult: OcrDocumentResult = {
    documentFingerprint: 'doc-forms-1',
    createdAt: '2026-11-23T08:00:00.000Z',
    engineId: 'tesseract-wasm',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        pageNumber: 1,
        pageIndex: 0,
        status: 'success',
        confidence: 0.95,
        blocks: [],
        lines: [
          {
            id: 'l-1',
            pageIndex: 0,
            text: 'Invoice Number: INV-100',
            confidence: 0.95,
            bbox: { x: 50, y: 100, width: 180, height: 14 },
            wordIds: [],
          },
          {
            id: 'l-2',
            pageIndex: 0,
            text: '[x] Agree to Terms',
            confidence: 0.95,
            bbox: { x: 50, y: 125, width: 140, height: 14 },
            wordIds: [],
          },
          {
            id: 'l-3',
            pageIndex: 0,
            text: 'SSN: 999-12-3456',
            confidence: 0.95,
            bbox: { x: 50, y: 150, width: 150, height: 14 },
            wordIds: [],
          },
        ],
        words: [],
      },
    ],
  };

  it('renders Key-Value tab by default with detected fields and copy actions', () => {
    render(<OcrFormFieldsPanel ocrResult={mockOcrResult} />);

    expect(screen.getByTestId('ocr-form-fields-panel')).toBeInTheDocument();
    expect(screen.getByTestId('tab-key-value-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('kv-table')).toBeInTheDocument();
    expect(screen.getByText('Invoice Number')).toBeInTheDocument();
    expect(screen.getByText('INV-100')).toBeInTheDocument();
  });

  it('switches to Checkboxes tab and toggles check state', () => {
    render(<OcrFormFieldsPanel ocrResult={mockOcrResult} />);

    fireEvent.click(screen.getByTestId('tab-omr-checkboxes'));
    expect(screen.getByTestId('omr-list')).toBeInTheDocument();
    expect(screen.getByText('Agree to Terms')).toBeInTheDocument();

    const markItem = screen.getByTestId('omr-mark-omr-0-1');
    fireEvent.click(markItem);
    // Toggled unchecked
  });

  it('switches to PII tab and allows Redact All PII', () => {
    const onRedacted = vi.fn();
    render(<OcrFormFieldsPanel ocrResult={mockOcrResult} onRedactionApplied={onRedacted} />);

    fireEvent.click(screen.getByTestId('tab-pii-sensitive'));
    expect(screen.getByTestId('pii-list')).toBeInTheDocument();
    expect(screen.getByText('***-**-3456')).toBeInTheDocument();

    const redactAllBtn = screen.getByTestId('btn-redact-all-pii');
    fireEvent.click(redactAllBtn);

    expect(onRedacted).toHaveBeenCalledWith(1);
    const redactionState = getState();
    expect(redactionState.regions).toHaveLength(1);
    expect(redactionState.regions[0].reason).toContain('OCR PII: SSN');
  });

  it('redacts individual field value from Key-Value table', () => {
    const onRedacted = vi.fn();
    render(<OcrFormFieldsPanel ocrResult={mockOcrResult} onRedactionApplied={onRedacted} />);

    const redactBtn = screen.getByTestId('btn-redact-val-kv-0-1');
    fireEvent.click(redactBtn);

    expect(onRedacted).toHaveBeenCalledWith(1);
    const redactionState = getState();
    expect(redactionState.regions).toHaveLength(1);
    expect(redactionState.regions[0].reason).toBe('Form Value: Invoice Number');
  });
});
