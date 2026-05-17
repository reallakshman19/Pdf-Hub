/*
 * MathJaxAdapter.
 *
 * In preview mode we cannot rely on heavy MathJax rendering or
 * asynchronous script loading.  This adapter defines a simple
 * function that returns a placeholder HTML string for LaTeX
 * expressions.  When server integration is available this module
 * could import mathjax-full and use `tex2svg` to produce real
 * vector output.
 */

export async function renderToSvg(latex: string): Promise<string> {
  // Return a wrapped LaTeX string as a placeholder SVG.  A true
  // implementation would call MathJax.tex2svg() and return
  // serialized SVG markup.
  const escaped = latex.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="latex-placeholder">${escaped}</span>`;
}