import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineOcrCorrectionPopover } from '../InlineOcrCorrectionPopover';
import {
  findNextLowConfidenceWordIndex,
  findPreviousLowConfidenceWordIndex,
  generateOcrSuggestions,
} from '@/core/ocr/corrections/useOcrProofreader';
import type { OcrWord } from '@/core/ocr/types';

describe('useOcrProofreader', () => {
  const words: OcrWord[] = [
    { id: 'w1', pageIndex: 0, text: 'HIGH1', normalizedText: 'high1', confidence: 0.95, bbox: { x: 0, y: 0, width: 20, height: 10 } },
    { id: 'w2', pageIndex: 0, text: 'LOW1', normalizedText: 'low1', confidence: 0.50, bbox: { x: 25, y: 0, width: 20, height: 10 } },
    { id: 'w3', pageIndex: 0, text: 'HIGH2', normalizedText: 'high2', confidence: 0.92, bbox: { x: 50, y: 0, width: 20, height: 10 } },
    { id: 'w4', pageIndex: 0, text: 'LOW2', normalizedText: 'low2', confidence: 0.60, bbox: { x: 75, y: 0, width: 20, height: 10 } },
  ];

  it('finds next low confidence word wrapping around', () => {
    expect(findNextLowConfidenceWordIndex(words, 0)).toBe(1); // from w1 -> w2
    expect(findNextLowConfidenceWordIndex(words, 1)).toBe(3); // from w2 -> w4
    expect(findNextLowConfidenceWordIndex(words, 3)).toBe(1); // from w4 wraps to w2
  });

  it('finds previous low confidence word wrapping around', () => {
    expect(findPreviousLowConfidenceWordIndex(words, 3)).toBe(1); // from w4 -> w2
    expect(findPreviousLowConfidenceWordIndex(words, 1)).toBe(3); // from w2 wraps to w4
  });

  it('generates suggestions swapping common OCR confusion characters', () => {
    const sugs = generateOcrSuggestions('C0NNECTI0N');
    expect(sugs.length).toBeGreaterThan(0);
    expect(sugs).toContain('CONNECTION');
  });
});

describe('InlineOcrCorrectionPopover', () => {
  const sampleWord: OcrWord = {
    id: 'w-test',
    pageIndex: 0,
    text: 'ST3EL',
    normalizedText: 'st3el',
    confidence: 0.55,
    bbox: { x: 100, y: 100, width: 40, height: 15 },
  };

  const anchorRect = {
    left: 150,
    top: 200,
    width: 40,
    height: 15,
  };

  it('renders input with initial text and confidence badge', () => {
    render(
      <InlineOcrCorrectionPopover
        word={sampleWord}
        initialText="ST3EL"
        anchorRect={anchorRect}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByTestId('ocr-correction-input') as HTMLInputElement;
    expect(input.value).toBe('ST3EL');
    expect(screen.getByText('55% conf')).toBeInTheDocument();
  });

  it('calls onCommit when Enter key is pressed', () => {
    const handleCommit = vi.fn();
    render(
      <InlineOcrCorrectionPopover
        word={sampleWord}
        initialText="ST3EL"
        anchorRect={anchorRect}
        onCommit={handleCommit}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByTestId('ocr-correction-input');
    fireEvent.change(input, { target: { value: 'STEEL' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleCommit).toHaveBeenCalledWith('STEEL');
  });

  it('calls onCommit when apply button is clicked', () => {
    const handleCommit = vi.fn();
    render(
      <InlineOcrCorrectionPopover
        word={sampleWord}
        initialText="ST3EL"
        anchorRect={anchorRect}
        onCommit={handleCommit}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByTestId('ocr-correction-input');
    fireEvent.change(input, { target: { value: 'STEEL' } });
    fireEvent.click(screen.getByTestId('ocr-correction-apply-btn'));

    expect(handleCommit).toHaveBeenCalledWith('STEEL');
  });

  it('triggers navigation on Tab and Shift+Tab keys', () => {
    const handleCommit = vi.fn();
    const handleNext = vi.fn();
    const handlePrev = vi.fn();

    render(
      <InlineOcrCorrectionPopover
        word={sampleWord}
        initialText="ST3EL"
        anchorRect={anchorRect}
        onCommit={handleCommit}
        onNavigateNext={handleNext}
        onNavigatePrev={handlePrev}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByTestId('ocr-correction-input');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(handleCommit).toHaveBeenCalledWith('ST3EL');
    expect(handleNext).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(handlePrev).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed or close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <InlineOcrCorrectionPopover
        word={sampleWord}
        initialText="ST3EL"
        anchorRect={anchorRect}
        onCommit={vi.fn()}
        onClose={handleClose}
      />
    );

    const input = screen.getByTestId('ocr-correction-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('ocr-correction-close-btn'));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
