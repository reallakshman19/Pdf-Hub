/*
 * MathJaxAdapter.
 *
 * Phase 0 keeps the lightweight placeholder, but routes diagnostics through
 * structured logging so source code has no console side effects.
 */

import { warn } from '@/core/logger/service';

/**
 * SECURITY: the SVG string this returns is rendered via
 * dangerouslySetInnerHTML in EquationOverlay.tsx without further
 * sanitization. It is safe only because this placeholder escapes
 * & < > and emits static SVG. Any real renderer substituted here
 * MUST have its output pass through a sanitizer that permits SVG,
 * or EquationOverlay becomes an XSS sink fed by OCR-extracted LaTeX.
 */
export async function renderToSvg(latex: string): Promise<string> {
  warn('ocr', 'MathJax SVG renderer is not wired yet; returning accessible placeholder SVG', {
    latexLength: latex.length,
  });
  const escaped = latex
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LaTeX preview"><text x="0" y="14">${escaped}</text></svg>`;
}
