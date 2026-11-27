/*
 * MathJaxAdapter.
 *
 * Offline W3C SVG mathematical layout adapter backed by core/ocr/latexToSvg.
 * Routes diagnostics through structured logging so source code has no console
 * side effects.
 */

import { debug } from '@/core/logger/service';
import { renderLatexToSvgSync, sanitizeMathSvg } from '@/core/ocr/latexToSvg';

/**
 * SECURITY: the SVG string this returns is rendered via
 * dangerouslySetInnerHTML in EquationOverlay.tsx without further
 * sanitization. Every token emitted by renderLatexToSvgSync is XML-escaped
 * and passed through sanitizeMathSvg so OCR-extracted LaTeX cannot become an
 * XSS sink.
 */
export async function renderToSvg(latex: string): Promise<string> {
  const svg = sanitizeMathSvg(renderLatexToSvgSync(latex));
  debug('ocr', 'Rendered equation to offline SVG', {
    latexLength: latex.length,
    svgLength: svg.length,
  });
  return svg;
}
