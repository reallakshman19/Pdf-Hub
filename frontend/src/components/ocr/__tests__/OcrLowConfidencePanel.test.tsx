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
import type { OcrLowConfidenceWord } from '@/core/ocr/ocrConfidence';
import { OcrLowConfidencePanel } from '../OcrLowConfidencePanel';

describe('OcrLowConfidencePanel', () => {
  it('renders empty state', () => {
    render(
      <OcrLowConfidencePanel words={[]} />,
    );

    expect(screen.getByTestId('ocr-low-confidence-panel')).toBeTruthy();
    expect(screen.getByText('No low-confidence words.')).toBeTruthy();
    expect(screen.getByTestId('ocr-low-confidence-count').textContent).toBe('0');
  });

  it('renders low-confidence word list', () => {
    render(
      <OcrLowConfidencePanel words={makeLowConfidenceWords()} />,
    );

    const items = screen.getAllByTestId('ocr-low-confidence-item');

    expect(items).toHaveLength(2);
    expect(screen.getByText('P1pe')).toBeTruthy();
    expect(screen.getByText('Supp0rt')).toBeTruthy();
    expect(screen.getByTestId('ocr-low-confidence-count').textContent).toBe('2');
  });

  it('calls onSelectWord when item clicked', () => {
    let selectedId: string | null = null;

    render(
      <OcrLowConfidencePanel
        words={makeLowConfidenceWords()}
        onSelectWord={(item) => {
          selectedId = item.word.id;
        }}
      />,
    );

    fireEvent.click(screen.getByText('P1pe'));

    expect(selectedId).toBe('word-1');
  });

  it('limits visible words', () => {
    render(
      <OcrLowConfidencePanel
        words={makeLowConfidenceWords()}
        maxItems={1}
      />,
    );

    expect(screen.getAllByTestId('ocr-low-confidence-item')).toHaveLength(1);
    expect(screen.getByText('Showing 1 of 2.')).toBeTruthy();
  });
});

function makeLowConfidenceWords(): OcrLowConfidenceWord[] {
  return [
    {
      pageIndex: 0,
      band: 'low',
      word: {
        id: 'word-1',
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
    },
    {
      pageIndex: 0,
      band: 'low',
      word: {
        id: 'word-2',
        pageIndex: 0,
        text: 'Supp0rt',
        normalizedText: 'supp0rt',
        confidence: 0.55,
        bbox: {
          x: 120,
          y: 680,
          width: 48,
          height: 14,
        },
      },
    },
  ];
}
