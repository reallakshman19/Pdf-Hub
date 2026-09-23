import { describe, expect, it } from 'vitest';
import {
  clampOcrConfidence,
  isRectInsidePage,
  normalizeOcrText,
  validateOcrPageResult,
  type OcrPageResult,
} from '../types';

describe('OCR core types and validation', () => {
  it('normalizes OCR text for search', () => {
    expect(normalizeOcrText('  PIPE   Support  ')).toBe('pipe support');
    expect(normalizeOcrText('ＡＢＣ')).toBe('abc');
    expect(normalizeOcrText('  नमस्ते   世界   CAFÉ  ')).toBe('नमस्ते 世界 café');
  });

  it('clamps confidence into 0–1 range', () => {
    expect(clampOcrConfidence(-1)).toBe(0);
    expect(clampOcrConfidence(0.5)).toBe(0.5);
    expect(clampOcrConfidence(5)).toBe(1);
    expect(clampOcrConfidence(Number.NaN)).toBe(0);
  });

  it('checks whether bbox is inside page bounds', () => {
    expect(
      isRectInsidePage(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 100, height: 100 },
      ),
    ).toBe(true);

    expect(
      isRectInsidePage(
        { x: 80, y: 0, width: 30, height: 100 },
        { width: 100, height: 100 },
      ),
    ).toBe(false);
  });

  it('validates OCR page result and rejects invalid bbox/confidence', () => {
    const page: OcrPageResult = {
      pageIndex: 0,
      pageNumber: 1, // compatibility
      status: 'success',
      pageType: 'scanned',
      orientationDeg: 0,
      languageHints: ['eng'],
      width: 100,
      height: 100,
      words: [
        {
          id: 'word-1',
          pageIndex: 0,
          text: 'Pipe',
          normalizedText: 'pipe',
          confidence: 0.9,
          bbox: { x: 10, y: 10, width: 20, height: 10 },
        },
        {
          id: 'word-2',
          pageIndex: 0,
          text: 'Bad',
          normalizedText: 'bad',
          confidence: 2,
          bbox: { x: 90, y: 10, width: 20, height: 10 },
        },
      ],
      lines: [],
      blocks: [],
      diagnostics: [],
    };

    const result = validateOcrPageResult(page);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'INVALID_OCR_RESULT')).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'OUT_OF_PAGE_BBOX')).toBe(true);
  });
});
