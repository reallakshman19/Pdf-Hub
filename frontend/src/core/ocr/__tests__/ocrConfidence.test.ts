import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  collectLowConfidenceWords,
  getOcrConfidenceBand,
  getOcrConfidenceClassName,
  getOcrConfidenceColor,
  summarizeOcrDocumentConfidence,
  summarizeOcrPageConfidence,
} from '../ocrConfidence';

describe('ocrConfidence', () => {
  it('maps confidence values to bands', () => {
    expect(getOcrConfidenceBand(0.95)).toBe('high');
    expect(getOcrConfidenceBand(0.75)).toBe('medium');
    expect(getOcrConfidenceBand(0.3)).toBe('low');
    expect(getOcrConfidenceBand(undefined)).toBe('unknown');
    expect(getOcrConfidenceBand(Number.NaN)).toBe('unknown');
  });

  it('maps confidence bands to class names and colors', () => {
    expect(getOcrConfidenceClassName('high')).toBe('ocr-confidence-high');
    expect(getOcrConfidenceClassName('medium')).toBe('ocr-confidence-medium');
    expect(getOcrConfidenceClassName('low')).toBe('ocr-confidence-low');
    expect(getOcrConfidenceClassName('unknown')).toBe('ocr-confidence-unknown');

    expect(getOcrConfidenceColor('high')).toBe('#16A34A');
    expect(getOcrConfidenceColor('medium')).toBe('#F59E0B');
    expect(getOcrConfidenceColor('low')).toBe('#DC2626');
    expect(getOcrConfidenceColor('unknown')).toBe('#64748B');
  });

  it('summarizes OCR page and document confidence', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-confidence',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const pageSummary = summarizeOcrPageConfidence(document.pages[0]!);
    const documentSummary = summarizeOcrDocumentConfidence(document);

    expect(pageSummary.totalWords).toBeGreaterThan(0);
    expect(pageSummary.highConfidenceWords).toBeGreaterThan(0);
    expect(pageSummary.lowConfidenceWords).toBeGreaterThan(0);
    expect(pageSummary.averageConfidence).toBeGreaterThan(0);
    expect(pageSummary.averageConfidence).toBeLessThanOrEqual(1);

    expect(documentSummary.totalWords).toBe(pageSummary.totalWords);
  });

  it('collects low-confidence words in page reading order', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-low-confidence',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const lowConfidenceWords = collectLowConfidenceWords(document, 0.7);

    expect(lowConfidenceWords.length).toBeGreaterThan(0);
    expect(lowConfidenceWords[0]!.word.text).toBe('P1pe');
    expect(lowConfidenceWords.every((item) => item.word.confidence < 0.7)).toBe(true);
  });
});
