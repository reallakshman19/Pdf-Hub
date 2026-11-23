import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OcrSearchBox } from '../OcrSearchBox';
import type { OcrDocumentResult } from '@/core/ocr/types';

describe('OcrSearchBox', () => {
  const mockDoc: OcrDocumentResult = {
    documentFingerprint: 'doc-box-1',
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
            text: 'First line with confidential details',
            confidence: 0.95,
            bbox: { x: 50, y: 100, width: 250, height: 14 },
            wordIds: ['w-1', 'w-2'],
          },
          {
            id: 'l-2',
            pageIndex: 0,
            text: 'Second line with confidential summary',
            confidence: 0.92,
            bbox: { x: 50, y: 120, width: 260, height: 14 },
            wordIds: ['w-3', 'w-4'],
          },
        ],
        words: [
          {
            id: 'w-1',
            lineId: 'l-1',
            pageIndex: 0,
            text: 'confidential',
            normalizedText: 'confidential',
            confidence: 0.95,
            bbox: { x: 120, y: 100, width: 70, height: 14 },
          },
          {
            id: 'w-3',
            lineId: 'l-2',
            pageIndex: 0,
            text: 'confidential',
            normalizedText: 'confidential',
            confidence: 0.92,
            bbox: { x: 120, y: 120, width: 70, height: 14 },
          },
        ],
      },
    ],
  };

  it('renders search input and responds to queries', () => {
    const handleActive = vi.fn();
    render(<OcrSearchBox document={mockDoc} onActiveMatchChange={handleActive} />);

    const input = screen.getByTestId('ocr-search-input');
    fireEvent.change(input, { target: { value: 'confidential' } });

    expect(screen.getByTestId('ocr-search-match-count')).toHaveTextContent('1 of 2');
    expect(handleActive).toHaveBeenCalled();
  });

  it('navigates next and previous matches with buttons and Enter key', () => {
    render(<OcrSearchBox document={mockDoc} />);

    const input = screen.getByTestId('ocr-search-input');
    fireEvent.change(input, { target: { value: 'confidential' } });

    const nextBtn = screen.getByTestId('ocr-search-next');
    fireEvent.click(nextBtn);
    expect(screen.getByTestId('ocr-search-match-count')).toHaveTextContent('2 of 2');

    const prevBtn = screen.getByTestId('ocr-search-prev');
    fireEvent.click(prevBtn);
    expect(screen.getByTestId('ocr-search-match-count')).toHaveTextContent('1 of 2');

    // Test Enter key
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(screen.getByTestId('ocr-search-match-count')).toHaveTextContent('2 of 2');
  });

  it('clears query when clicking clear button', () => {
    render(<OcrSearchBox document={mockDoc} />);

    const input = screen.getByTestId('ocr-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'details' } });
    expect(input.value).toBe('details');

    const clearBtn = screen.getByTestId('ocr-search-clear');
    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
    expect(screen.queryByTestId('ocr-search-match-count')).toBeNull();
  });
});
