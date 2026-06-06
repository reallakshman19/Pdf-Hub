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
} from '@testing-library/react';
import type { OcrWord } from '@/core/ocr/types';
import { createOcrCorrection } from '@/core/ocr/ocrCorrections';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { OcrCorrectionPanel } from '../OcrCorrectionPanel';

describe('OcrCorrectionPanel', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('renders empty state when no word is selected', () => {
    render(
      <OcrCorrectionPanel
        word={null}
        documentFingerprint="doc-empty"
      />,
    );

    expect(screen.getByTestId('ocr-correction-empty')).toBeTruthy();
    expect(screen.getByText('Select a low-confidence OCR word to correct it.')).toBeTruthy();
  });

  it('renders selected word details', () => {
    render(
      <OcrCorrectionPanel
        word={makeWord()}
        documentFingerprint="doc-correction"
      />,
    );

    expect(screen.getByTestId('ocr-correction-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-correction-original')).toHaveValue('P1pe');
    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('P1pe');
    expect(screen.getByText('62%')).toBeTruthy();
  });

  it('saves correction to OCR store', () => {
    render(
      <OcrCorrectionPanel
        word={makeWord()}
        documentFingerprint="doc-correction"
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-correction-input'), {
      target: {
        value: 'Pipe',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-correction-save'));

    const corrections = useOcrStore.getState().corrections;

    expect(corrections).toHaveLength(1);
    expect(corrections[0].documentFingerprint).toBe('doc-correction');
    expect(corrections[0].targetId).toBe('word-1');
    expect(corrections[0].originalText).toBe('P1pe');
    expect(corrections[0].correctedText).toBe('Pipe');
    expect(corrections[0].targetType).toBe('word');
  });

  it('disables save when corrected text is unchanged', () => {
    render(
      <OcrCorrectionPanel
        word={makeWord()}
        documentFingerprint="doc-correction"
      />,
    );

    expect(screen.getByTestId('ocr-correction-save')).toBeDisabled();

    fireEvent.change(screen.getByTestId('ocr-correction-input'), {
      target: {
        value: 'Pipe',
      },
    });

    expect(screen.getByTestId('ocr-correction-save')).not.toBeDisabled();
  });

  it('detects existing correction and allows delete', () => {
    const word = makeWord();

    useOcrStore.getState().upsertOcrCorrection(
      createOcrCorrection({
        id: 'correction-1',
        documentFingerprint: 'doc-correction',
        pageIndex: word.pageIndex,
        targetId: word.id,
        targetType: 'word',
        originalText: word.text,
        correctedText: 'Pipe',
        bbox: word.bbox,
        now: '2026-01-01T00:00:00.000Z',
      }),
    );

    render(
      <OcrCorrectionPanel
        word={word}
        documentFingerprint="doc-correction"
      />,
    );

    expect(screen.getByTestId('ocr-correction-existing')).toBeTruthy();
    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('Pipe');
    expect(useOcrStore.getState().corrections).toHaveLength(1);

    fireEvent.click(screen.getByTestId('ocr-correction-delete'));

    expect(useOcrStore.getState().corrections).toHaveLength(0);
    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('P1pe');
  });

  it('resets input back to original OCR text', () => {
    render(
      <OcrCorrectionPanel
        word={makeWord()}
        documentFingerprint="doc-correction"
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-correction-input'), {
      target: {
        value: 'Pipe',
      },
    });

    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('Pipe');

    fireEvent.click(screen.getByTestId('ocr-correction-reset'));

    expect(screen.getByTestId('ocr-correction-input')).toHaveValue('P1pe');
  });

  it('warns when document fingerprint is missing', () => {
    render(
      <OcrCorrectionPanel
        word={makeWord()}
        documentFingerprint={null}
      />,
    );

    expect(screen.getByTestId('ocr-correction-missing-document')).toBeTruthy();
    expect(screen.getByTestId('ocr-correction-save')).toBeDisabled();
  });
});

function makeWord(): OcrWord {
  return {
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
  };
}
