import type { OcrPageType } from './types';

export interface OcrPageClassificationInput {
  pageIndex: number;
  width: number;
  height: number;

  /**
   * Number of embedded PDF text characters extracted from the page.
   * Use 0 when unknown/unavailable.
   */
  embeddedTextLength?: number;

  /**
   * Number of image XObjects or rendered images detected on the page.
   */
  imageCount?: number;

  /**
   * Number of vector drawing/path operations if available.
   * Useful for engineering drawings.
   */
  vectorObjectCount?: number;

  /**
   * Optional lightweight signals from page analysis.
   */
  detectedGridLikeRegions?: number;
  detectedFormFields?: number;
  detectedLargeImages?: number;
  detectedTitleBlockLikeRegions?: number;
}

export interface OcrPageClassificationResult {
  pageIndex: number;
  pageType: OcrPageType;
  confidence: number;
  reasons: string[];
}

export function classifyOcrPage(
  input: OcrPageClassificationInput,
): OcrPageClassificationResult {
  const embeddedTextLength = input.embeddedTextLength ?? 0;
  const imageCount = input.imageCount ?? 0;
  const vectorObjectCount = input.vectorObjectCount ?? 0;
  const gridRegions = input.detectedGridLikeRegions ?? 0;
  const formFields = input.detectedFormFields ?? 0;
  const largeImages = input.detectedLargeImages ?? 0;
  const titleBlocks = input.detectedTitleBlockLikeRegions ?? 0;

  const reasons: string[] = [];

  if (titleBlocks > 0 || vectorObjectCount >= 250) {
    reasons.push('Engineering drawing signals detected.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'engineeringDrawing',
      confidence: titleBlocks > 0 ? 0.92 : 0.78,
      reasons,
    };
  }

  if (formFields > 0) {
    reasons.push('Form-field-like regions detected.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'formHeavy',
      confidence: 0.88,
      reasons,
    };
  }

  if (gridRegions > 0) {
    reasons.push('Grid/table-like regions detected.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'tableHeavy',
      confidence: 0.86,
      reasons,
    };
  }

  if (embeddedTextLength >= 120 && imageCount === 0) {
    reasons.push('Page has substantial embedded text and no image-heavy signals.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'bornDigital',
      confidence: 0.94,
      reasons,
    };
  }

  if (embeddedTextLength >= 120 && imageCount > 0) {
    reasons.push('Page has embedded text and image content.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'mixed',
      confidence: 0.82,
      reasons,
    };
  }

  if (largeImages > 0 || imageCount > 0) {
    reasons.push('Page appears image/scanned content heavy.');
    return {
      pageIndex: input.pageIndex,
      pageType: largeImages > 0 ? 'imageHeavy' : 'scanned',
      confidence: largeImages > 0 ? 0.84 : 0.8,
      reasons,
    };
  }

  if (embeddedTextLength > 0) {
    reasons.push('Page has some embedded text but insufficient signal for born-digital classification.');
    return {
      pageIndex: input.pageIndex,
      pageType: 'mixed',
      confidence: 0.64,
      reasons,
    };
  }

  reasons.push('No reliable text/image/layout signals were provided.');
  return {
    pageIndex: input.pageIndex,
    pageType: 'unknown',
    confidence: 0.5,
    reasons,
  };
}

export function shouldPreferEmbeddedText(
  pageType: OcrPageType,
): boolean {
  return pageType === 'bornDigital' || pageType === 'mixed';
}

export function isLikelyScannedPage(
  pageType: OcrPageType,
): boolean {
  return pageType === 'scanned'
    || pageType === 'imageHeavy'
    || pageType === 'tableHeavy'
    || pageType === 'formHeavy'
    || pageType === 'engineeringDrawing';
}
