import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { OcrSearchMatch } from '@/core/ocr/ocrSearchIndex';
import { OcrSearchMiniPanel } from '../OcrSearchMiniPanel';

const match: OcrSearchMatch = {
  item: {
    id: 'ocr-word:0:word-1',
    documentFingerprint: 'doc-search',
    pageIndex: 0,
    source: 'ocrWord',
    targetId: 'word-1',
    text: 'PROCESS',
    normalizedText: 'process',
    confidence: 0.61,
    bbox: {
      x: 72,
      y: 120,
      width: 54,
      height: 14,
    },
  },
  score: 1,
  ranges: [{ start: 0, end: 7 }],
};

describe('OcrSearchMiniPanel', () => {
  it('renders search matches as document-navigation actions', () => {
    const onSelectMatch = vi.fn();

    render(
      <OcrSearchMiniPanel
        onSearch={() => [match]}
        onSelectMatch={onSelectMatch}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search OCR result'), {
      target: { value: 'process' },
    });

    const result = screen.getByTestId('ocr-search-match');
    expect(result.tagName).toBe('BUTTON');
    expect(screen.getByText('Page 1 · show in document')).toBeTruthy();

    fireEvent.click(result);
    expect(onSelectMatch).toHaveBeenCalledWith(match);
  });

  it('clears matches when the query is cleared', () => {
    render(
      <OcrSearchMiniPanel
        onSearch={() => [match]}
      />,
    );

    const input = screen.getByPlaceholderText('Search OCR result');

    fireEvent.change(input, { target: { value: 'process' } });
    expect(screen.getByTestId('ocr-search-match')).toBeTruthy();

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByTestId('ocr-search-match')).toBeNull();
  });
});
