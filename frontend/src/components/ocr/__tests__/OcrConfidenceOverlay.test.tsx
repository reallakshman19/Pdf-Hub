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
import type { OcrWord } from '@/core/ocr/types';
import {
  OcrConfidenceOverlay,
  pdfRectToViewportRect,
} from '../OcrConfidenceOverlay';

describe('OcrConfidenceOverlay', () => {
  it('maps PDF coordinates to viewport coordinates', () => {
    const rect = pdfRectToViewportRect({
      rect: {
        x: 100,
        y: 200,
        width: 50,
        height: 20,
      },
      pageWidth: 500,
      pageHeight: 1000,
      viewportWidth: 250,
      viewportHeight: 500,
    });

    expect(rect.left).toBe(50);
    expect(rect.top).toBe(390);
    expect(rect.width).toBe(25);
    expect(rect.height).toBe(10);
  });

  it('renders confidence boxes for words on the selected page', () => {
    render(
      <div style={{ position: 'relative', width: 595, height: 842 }}>
        <OcrConfidenceOverlay
          pageIndex={0}
          pageWidth={595}
          pageHeight={842}
          viewportWidth={595}
          viewportHeight={842}
          words={makeWords()}
        />
      </div>,
    );

    const boxes = screen.getAllByTestId('ocr-confidence-word');

    expect(boxes).toHaveLength(3);
    expect(boxes[0].getAttribute('data-ocr-confidence-band')).toBe('high');
    expect(boxes[1].getAttribute('data-ocr-confidence-band')).toBe('medium');
    expect(boxes[2].getAttribute('data-ocr-confidence-band')).toBe('low');
  });

  it('does not render when invisible', () => {
    render(
      <OcrConfidenceOverlay
        visible={false}
        pageIndex={0}
        pageWidth={595}
        pageHeight={842}
        viewportWidth={595}
        viewportHeight={842}
        words={makeWords()}
      />,
    );

    expect(screen.queryByTestId('ocr-confidence-overlay')).toBeNull();
  });

  it('filters by low confidence band', () => {
    render(
      <div style={{ position: 'relative', width: 595, height: 842 }}>
        <OcrConfidenceOverlay
          pageIndex={0}
          pageWidth={595}
          pageHeight={842}
          viewportWidth={595}
          viewportHeight={842}
          words={makeWords()}
          minConfidenceBand="low"
        />
      </div>,
    );

    const boxes = screen.getAllByTestId('ocr-confidence-word');

    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute('data-ocr-word-id')).toBe('word-low');
  });

  it('calls onWordClick when a confidence word box is clicked', () => {
    let clickedWordId: string | null = null;

    render(
      <div style={{ position: 'relative', width: 595, height: 842 }}>
        <OcrConfidenceOverlay
          pageIndex={0}
          pageWidth={595}
          pageHeight={842}
          viewportWidth={595}
          viewportHeight={842}
          words={makeWords()}
          onWordClick={(word) => {
            clickedWordId = word.id;
          }}
        />
      </div>,
    );

    fireEvent.click(screen.getByTitle('P1pe · 62%'));

    expect(clickedWordId).toBe('word-low');
  });
});

function makeWords(): OcrWord[] {
  return [
    {
      id: 'word-high',
      pageIndex: 0,
      text: 'Writer',
      normalizedText: 'writer',
      confidence: 0.98,
      bbox: {
        x: 72,
        y: 720,
        width: 45,
        height: 14,
      },
    },
    {
      id: 'word-medium',
      pageIndex: 0,
      text: 'OCR',
      normalizedText: 'ocr',
      confidence: 0.78,
      bbox: {
        x: 130,
        y: 720,
        width: 28,
        height: 14,
      },
    },
    {
      id: 'word-low',
      pageIndex: 0,
      text: 'P1pe',
      normalizedText: 'p1pe',
      confidence: 0.62,
      bbox: {
        x: 72,
        y: 680,
        width: 30,
        height: 14,
      },
    },
    {
      id: 'word-page-2',
      pageIndex: 1,
      text: 'Hidden',
      normalizedText: 'hidden',
      confidence: 0.5,
      bbox: {
        x: 72,
        y: 680,
        width: 50,
        height: 14,
      },
    },
  ];
}
