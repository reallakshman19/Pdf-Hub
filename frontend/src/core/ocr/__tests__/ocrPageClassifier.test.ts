import { describe, expect, it } from 'vitest';
import {
  classifyOcrPage,
  isLikelyScannedPage,
  shouldPreferEmbeddedText,
} from '../ocrPageClassifier';

describe('ocrPageClassifier', () => {
  it('classifies born-digital pages when embedded text is strong and images are absent', () => {
    const result = classifyOcrPage({
      pageIndex: 0,
      width: 595,
      height: 842,
      embeddedTextLength: 2000,
      imageCount: 0,
    });

    expect(result.pageType).toBe('bornDigital');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(shouldPreferEmbeddedText(result.pageType)).toBe(true);
  });

  it('classifies mixed pages when embedded text and images coexist', () => {
    const result = classifyOcrPage({
      pageIndex: 1,
      width: 595,
      height: 842,
      embeddedTextLength: 1500,
      imageCount: 2,
    });

    expect(result.pageType).toBe('mixed');
    expect(shouldPreferEmbeddedText(result.pageType)).toBe(true);
  });

  it('classifies table-heavy pages from grid signals', () => {
    const result = classifyOcrPage({
      pageIndex: 2,
      width: 595,
      height: 842,
      embeddedTextLength: 0,
      imageCount: 1,
      detectedGridLikeRegions: 2,
    });

    expect(result.pageType).toBe('tableHeavy');
    expect(isLikelyScannedPage(result.pageType)).toBe(true);
  });

  it('classifies form-heavy pages from form-field signals', () => {
    const result = classifyOcrPage({
      pageIndex: 3,
      width: 595,
      height: 842,
      detectedFormFields: 5,
    });

    expect(result.pageType).toBe('formHeavy');
    expect(isLikelyScannedPage(result.pageType)).toBe(true);
  });

  it('classifies engineering drawings from vector/title-block signals', () => {
    const byTitleBlock = classifyOcrPage({
      pageIndex: 4,
      width: 2384,
      height: 1684,
      detectedTitleBlockLikeRegions: 1,
    });

    expect(byTitleBlock.pageType).toBe('engineeringDrawing');

    const byVectorDensity = classifyOcrPage({
      pageIndex: 5,
      width: 2384,
      height: 1684,
      vectorObjectCount: 300,
    });

    expect(byVectorDensity.pageType).toBe('engineeringDrawing');
  });

  it('classifies image-heavy/scanned pages from image signals', () => {
    const imageHeavy = classifyOcrPage({
      pageIndex: 6,
      width: 595,
      height: 842,
      imageCount: 1,
      detectedLargeImages: 1,
    });

    expect(imageHeavy.pageType).toBe('imageHeavy');

    const scanned = classifyOcrPage({
      pageIndex: 7,
      width: 595,
      height: 842,
      imageCount: 1,
    });

    expect(scanned.pageType).toBe('scanned');
  });

  it('returns unknown when no reliable signals exist', () => {
    const result = classifyOcrPage({
      pageIndex: 8,
      width: 595,
      height: 842,
    });

    expect(result.pageType).toBe('unknown');
    expect(result.confidence).toBe(0.5);
  });
});
