import type { OcrDocumentResult, OcrPageResult, OcrWord } from './types';

export type OcrConfidenceBand =
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown';

export interface OcrConfidenceThresholds {
  high: number;
  medium: number;
}

export interface OcrConfidenceSummary {
  totalWords: number;
  highConfidenceWords: number;
  mediumConfidenceWords: number;
  lowConfidenceWords: number;
  averageConfidence: number;
  lowestConfidence?: number;
  highestConfidence?: number;
}

export interface OcrLowConfidenceWord {
  pageIndex: number;
  word: OcrWord;
  band: OcrConfidenceBand;
}

export const DEFAULT_OCR_CONFIDENCE_THRESHOLDS: OcrConfidenceThresholds = {
  high: 0.9,
  medium: 0.7,
};

export function getOcrConfidenceBand(
  confidence: number | undefined,
  thresholds: OcrConfidenceThresholds = DEFAULT_OCR_CONFIDENCE_THRESHOLDS,
): OcrConfidenceBand {
  if (confidence === undefined || !Number.isFinite(confidence)) {
    return 'unknown';
  }

  if (confidence >= thresholds.high) {
    return 'high';
  }

  if (confidence >= thresholds.medium) {
    return 'medium';
  }

  return 'low';
}

export function getOcrConfidenceClassName(
  band: OcrConfidenceBand,
): string {
  if (band === 'high') return 'ocr-confidence-high';
  if (band === 'medium') return 'ocr-confidence-medium';
  if (band === 'low') return 'ocr-confidence-low';
  return 'ocr-confidence-unknown';
}

export function getOcrConfidenceColor(
  band: OcrConfidenceBand,
): string {
  if (band === 'high') return '#16A34A';
  if (band === 'medium') return '#F59E0B';
  if (band === 'low') return '#DC2626';
  return '#64748B';
}

export function summarizeOcrPageConfidence(
  page: OcrPageResult,
  thresholds: OcrConfidenceThresholds = DEFAULT_OCR_CONFIDENCE_THRESHOLDS,
): OcrConfidenceSummary {
  return summarizeWords(page.words ?? [], thresholds);
}

export function summarizeOcrDocumentConfidence(
  document: OcrDocumentResult,
  thresholds: OcrConfidenceThresholds = DEFAULT_OCR_CONFIDENCE_THRESHOLDS,
): OcrConfidenceSummary {
  return summarizeWords(
    document.pages.flatMap((page) => page.words ?? []),
    thresholds,
  );
}

export function collectLowConfidenceWords(
  document: OcrDocumentResult,
  threshold = DEFAULT_OCR_CONFIDENCE_THRESHOLDS.medium,
): OcrLowConfidenceWord[] {
  const result: OcrLowConfidenceWord[] = [];

  for (const page of document.pages) {
    const words = page.words ?? [];
    for (const word of words) {
      if (word.confidence < threshold) {
        result.push({
          pageIndex: page.pageIndex ?? (page.pageNumber - 1),
          word,
          band: getOcrConfidenceBand(word.confidence),
        });
      }
    }
  }

  result.sort((a, b) => {
    const pageDelta = a.pageIndex - b.pageIndex;
    if (pageDelta !== 0) return pageDelta;

    const yDelta = b.word.bbox.y - a.word.bbox.y;
    if (yDelta !== 0) return yDelta;

    return a.word.bbox.x - b.word.bbox.x;
  });

  return result;
}

function summarizeWords(
  words: OcrWord[],
  thresholds: OcrConfidenceThresholds,
): OcrConfidenceSummary {
  if (words.length === 0) {
    return {
      totalWords: 0,
      highConfidenceWords: 0,
      mediumConfidenceWords: 0,
      lowConfidenceWords: 0,
      averageConfidence: 0,
    };
  }

  let highConfidenceWords = 0;
  let mediumConfidenceWords = 0;
  let lowConfidenceWords = 0;
  let totalConfidence = 0;
  let lowestConfidence = Number.POSITIVE_INFINITY;
  let highestConfidence = Number.NEGATIVE_INFINITY;

  for (const word of words) {
    const confidence = clampConfidence(word.confidence);
    const band = getOcrConfidenceBand(confidence, thresholds);

    if (band === 'high') {
      highConfidenceWords += 1;
    } else if (band === 'medium') {
      mediumConfidenceWords += 1;
    } else {
      lowConfidenceWords += 1;
    }

    totalConfidence += confidence;
    lowestConfidence = Math.min(lowestConfidence, confidence);
    highestConfidence = Math.max(highestConfidence, confidence);
  }

  return {
    totalWords: words.length,
    highConfidenceWords,
    mediumConfidenceWords,
    lowConfidenceWords,
    averageConfidence: roundConfidence(totalConfidence / words.length),
    lowestConfidence: roundConfidence(lowestConfidence),
    highestConfidence: roundConfidence(highestConfidence),
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
