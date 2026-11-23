import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OcrCanvasTextLayer } from '../OcrCanvasTextLayer';
import {
  ocrRectToViewportStyle,
  getEffectiveWordText,
  isWordLowConfidence,
} from '../ocrCanvasCoordinateAdapter';
import type { OcrPageResult, OcrWord } from '@/core/ocr/types';
import { useOcrStore } from '@/core/ocr/ocrStore';

describe('ocrCanvasCoordinateAdapter', () => {
  it('correctly converts PDF user space rect to scaled viewport CSS dimensions', () => {
    const rect = { x: 50, y: 100, width: 80, height: 20 };
    const scaled = ocrRectToViewportStyle(rect, 1.5);

    expect(scaled.left).toBe(75);
    expect(scaled.top).toBe(150);
    expect(scaled.width).toBe(120);
    expect(scaled.height).toBe(30);
    expect(scaled.fontSize).toBe(25.5);
  });

  it('determines effective word text taking corrections into account', () => {
    const word: OcrWord = {
      id: 'w1',
      pageIndex: 0,
      text: 'flavour',
      normalizedText: 'flavour',
      confidence: 0.95,
      bbox: { x: 0, y: 0, width: 50, height: 10 },
    };

    expect(getEffectiveWordText(word)).toBe('flavour');

    const correctionsMap = new Map([
      ['w1', {
        id: 'c1',
        targetId: 'w1',
        targetType: 'word' as const,
        bbox: { x: 0, y: 0, width: 50, height: 10 },
        pageIndex: 0,
        originalText: 'flavour',
        correctedText: 'flavor',
        createdAt: '2026-11-23T00:00:00Z',
        updatedAt: '2026-11-23T00:00:00Z',
        documentFingerprint: 'doc1',
      }],
    ]);

    expect(getEffectiveWordText(word, correctionsMap)).toBe('flavor');
  });

  it('flags uncorrected low confidence words and clears flag when corrected', () => {
    const word: OcrWord = {
      id: 'w2',
      pageIndex: 0,
      text: 'O1L',
      normalizedText: 'o1l',
      confidence: 0.65,
      bbox: { x: 0, y: 0, width: 50, height: 10 },
    };

    expect(isWordLowConfidence(word, undefined, 0.75)).toBe(true);

    const correctionsMap = new Map([
      ['w2', {
        id: 'c2',
        targetId: 'w2',
        targetType: 'word' as const,
        bbox: { x: 0, y: 0, width: 50, height: 10 },
        pageIndex: 0,
        originalText: 'O1L',
        correctedText: 'OIL',
        createdAt: '2026-11-23T00:00:00Z',
        updatedAt: '2026-11-23T00:00:00Z',
        documentFingerprint: 'doc1',
      }],
    ]);

    expect(isWordLowConfidence(word, correctionsMap, 0.75)).toBe(false);
  });
});

describe('OcrCanvasTextLayer', () => {
  const samplePage: OcrPageResult = {
    status: 'complete',
    pageIndex: 0,
    pageNumber: 1,
    width: 612,
    height: 792,
    blocks: [],
    words: [
      {
        id: 'word-1',
        pageIndex: 0,
        text: 'SPECIFICATION',
        normalizedText: 'specification',
        confidence: 0.98,
        bbox: { x: 100, y: 50, width: 120, height: 15 },
      },
      {
        id: 'word-2',
        pageIndex: 0,
        text: 'DIAMET3R',
        normalizedText: 'diamet3r',
        confidence: 0.58, // Low confidence
        bbox: { x: 230, y: 50, width: 80, height: 15 },
      },
    ],
  };

  beforeEach(() => {
    useOcrStore.setState({
      corrections: [],
    });
  });

  it('renders selectable text spans matching OCR words', () => {
    render(
      <OcrCanvasTextLayer
        pageIndex={0}
        pageResult={samplePage}
        scale={1.0}
      />
    );

    const layer = screen.getByTestId('ocr-canvas-text-layer');
    expect(layer).toBeInTheDocument();

    const spans = screen.getAllByTestId('ocr-word-span');
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('SPECIFICATION');
    expect(spans[1].textContent).toBe('DIAMET3R');
    expect(spans[1]).toHaveAttribute('data-low-confidence', 'true');
  });

  it('triggers onWordClick when a word span is clicked', () => {
    const handleWordClick = vi.fn();

    render(
      <OcrCanvasTextLayer
        pageIndex={0}
        pageResult={samplePage}
        scale={1.0}
        onWordClick={handleWordClick}
      />
    );

    const spans = screen.getAllByTestId('ocr-word-span');
    fireEvent.click(spans[1]);

    expect(handleWordClick).toHaveBeenCalledTimes(1);
    expect(handleWordClick).toHaveBeenCalledWith(
      samplePage.words![1],
      'DIAMET3R',
      expect.any(Object),
    );
  });

  it('applies correction from useOcrStore', () => {
    useOcrStore.setState({
      corrections: [
        {
          id: 'corr-1',
          targetId: 'word-2',
          targetType: 'word',
          bbox: { x: 120, y: 50, width: 80, height: 16 },
          pageIndex: 0,
          originalText: 'DIAMET3R',
          correctedText: 'DIAMETER',
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
          documentFingerprint: 'doc-test',
        },
      ],
    });

    render(
      <OcrCanvasTextLayer
        pageIndex={0}
        pageResult={samplePage}
        scale={1.0}
      />
    );

    const spans = screen.getAllByTestId('ocr-word-span');
    expect(spans[1].textContent).toBe('DIAMETER');
    expect(spans[1]).toHaveAttribute('data-corrected', 'true');
    expect(spans[1]).toHaveAttribute('data-low-confidence', 'false');
  });

  it('returns null when visible is false or pageResult is null', () => {
    const { container, rerender } = render(
      <OcrCanvasTextLayer
        pageIndex={0}
        pageResult={null}
        scale={1.0}
      />
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <OcrCanvasTextLayer
        pageIndex={0}
        pageResult={samplePage}
        scale={1.0}
        visible={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
