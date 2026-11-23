import { describe, it, expect } from 'vitest';
import {
  calculateBoxFillRatio,
  classifyFillRatio,
  detectOmrMarksFromText,
} from '../ocrOmrDetector';
import type { OcrPageResult, OcrLine } from '../../types';

describe('ocrOmrDetector', () => {
  it('calculates fill ratio accurately on pixel buffers', () => {
    // 20x20 image RGBA
    const width = 20;
    const height = 20;
    const whitePixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const darkPixels = new Uint8ClampedArray(width * height * 4).fill(0); // all black

    const box = { x: 0, y: 0, width: 20, height: 20 };

    const whiteRatio = calculateBoxFillRatio(whitePixels, width, height, box, 1);
    expect(whiteRatio).toBe(0);

    const darkRatio = calculateBoxFillRatio(darkPixels, width, height, box, 1);
    expect(darkRatio).toBe(1);
  });

  it('classifies fill ratios into checked, unchecked, and indeterminate', () => {
    expect(classifyFillRatio(0.45)).toBe('checked');
    expect(classifyFillRatio(0.30)).toBe('checked');
    expect(classifyFillRatio(0.08)).toBe('unchecked');
    expect(classifyFillRatio(0.20)).toBe('indeterminate');
  });

  it('detects checkbox marks from OCR text symbols with inline labels', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-1',
        pageIndex: 0,
        text: '[x] I agree to the terms and conditions',
        confidence: 0.95,
        bbox: { x: 50, y: 100, width: 250, height: 16 },
        wordIds: [],
      },
      {
        id: 'l-2',
        pageIndex: 0,
        text: '[ ] Send me weekly newsletter updates',
        confidence: 0.92,
        bbox: { x: 50, y: 125, width: 240, height: 16 },
        wordIds: [],
      },
      {
        id: 'l-3',
        pageIndex: 0,
        text: '(•) Option A: Expedited Delivery',
        confidence: 0.94,
        bbox: { x: 50, y: 150, width: 200, height: 16 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.94,
      blocks: [],
      lines,
      words: [],
    };

    const marks = detectOmrMarksFromText(pageResult);
    expect(marks).toHaveLength(3);

    expect(marks[0].type).toBe('checkbox');
    expect(marks[0].state).toBe('checked');
    expect(marks[0].label).toBe('I agree to the terms and conditions');

    expect(marks[1].type).toBe('checkbox');
    expect(marks[1].state).toBe('unchecked');
    expect(marks[1].label).toBe('Send me weekly newsletter updates');

    expect(marks[2].type).toBe('radio');
    expect(marks[2].state).toBe('checked');
    expect(marks[2].label).toBe('Option A: Expedited Delivery');
  });

  it('links standalone checkbox symbol to adjacent right-hand label', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-mark',
        pageIndex: 0,
        text: '□',
        confidence: 0.9,
        bbox: { x: 50, y: 100, width: 14, height: 14 },
        wordIds: [],
      },
      {
        id: 'l-label',
        pageIndex: 0,
        text: 'Subscribe to alerts',
        confidence: 0.95,
        bbox: { x: 72, y: 100, width: 120, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.92,
      blocks: [],
      lines,
      words: [],
    };

    const marks = detectOmrMarksFromText(pageResult);
    expect(marks).toHaveLength(1);
    expect(marks[0].state).toBe('unchecked');
    expect(marks[0].label).toBe('Subscribe to alerts');
  });
});
