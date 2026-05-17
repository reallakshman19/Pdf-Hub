/*
 * OcrConfidenceOverlay component.
 *
 * This optional overlay shades regions of the page based on OCR
 * confidence.  Low confidence areas are tinted yellow while high
 * confidence areas are transparent.  In this stub implementation
 * confidence is not computed per region and the overlay is omitted.
 */

import type { OcrStore } from '../../core/ocr/store';

export interface OcrConfidenceOverlayProps {
  ocrStore: OcrStore;
  pageNumber: number;
  scale: number;
}

export default function OcrConfidenceOverlay(props: OcrConfidenceOverlayProps): null {
  void props;
  return null;
}