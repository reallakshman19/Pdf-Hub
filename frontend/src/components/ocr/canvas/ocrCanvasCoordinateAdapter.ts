import type { PdfRect } from '@/core/writer-v2/types';
import type { OcrCorrection, OcrWord } from '@/core/ocr/types';

export interface ViewportRectStyle {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
}

/**
 * Converts a PDF user-space bounding box to viewport CSS pixel coordinates.
 * In PDF Hub, unrotated PDF user space coordinates are scaled by `viewportScale`.
 */
export function ocrRectToViewportStyle(
  rect: PdfRect,
  scale: number,
): ViewportRectStyle {
  const safeScale = Math.max(0.01, scale);
  const left = Math.round((rect.x ?? 0) * safeScale * 100) / 100;
  const top = Math.round((rect.y ?? 0) * safeScale * 100) / 100;
  const width = Math.max(2, Math.round((rect.width ?? 10) * safeScale * 100) / 100);
  const height = Math.max(2, Math.round((rect.height ?? 10) * safeScale * 100) / 100);
  const fontSize = Math.max(8, Math.round(height * 0.85 * 10) / 10);

  return {
    left,
    top,
    width,
    height,
    fontSize,
  };
}

/**
 * Resolves the effective display text of an OCR word, accounting for user corrections.
 */
export function getEffectiveWordText(
  word: OcrWord,
  correctionsByTargetId?: Map<string, OcrCorrection>,
): string {
  const correction = correctionsByTargetId?.get(word.id);
  if (correction && correction.correctedText) {
    return correction.correctedText;
  }
  return word.text ?? '';
}

/**
 * Checks whether an OCR word has low confidence (< 0.75) and has not yet been corrected.
 */
export function isWordLowConfidence(
  word: OcrWord,
  correctionsByTargetId?: Map<string, OcrCorrection>,
  threshold: number = 0.75,
): boolean {
  if (correctionsByTargetId?.has(word.id)) {
    return false; // Corrected words are no longer flagged as low confidence
  }
  return (word.confidence ?? 1.0) < threshold;
}
