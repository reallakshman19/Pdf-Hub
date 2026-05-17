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
  // eslint-disable-next-line no-console
  console.warn('[MathJax STUB] renderToSvg returning placeholder. Real MathJax tex2svg not yet wired.');
  const escaped = latex.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="latex-placeholder" title="LaTeX preview — MathJax not loaded">${escaped}</span>`;
}