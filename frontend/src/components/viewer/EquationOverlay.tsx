/*
 * EquationOverlay component.
 *
 * This placeholder component renders equation OCR results on top of
 * the PDF page.  At present the OCR preview adapter does not
 * produce equation blocks, so this component returns null.  When
 * integrated with an equation recognition engine, it would render
 * LaTeX using MathJax or similar libraries.
 */

import type { OcrStore } from '../../core/ocr/store';

export interface EquationOverlayProps {
  ocrStore: OcrStore;
  pageNumber: number;
  scale: number;
}

export default function EquationOverlay(props: EquationOverlayProps): null {
  void props;
  return null;
}