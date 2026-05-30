/*
 * MathJaxAdapter.
 *
 * Phase 0 keeps the lightweight placeholder, but routes diagnostics through
 * structured logging so source code has no console side effects.
 */

import { warn } from '@/core/logger/service';

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
