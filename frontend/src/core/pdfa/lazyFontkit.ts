/**
 * Lazy loader for @pdf-lib/fontkit compatible with Vite ESM workers and Vitest.
 */

export type PdfLibFontkit = Parameters<import('pdf-lib').PDFDocument['registerFontkit']>[0];

let fontkitPromise: Promise<PdfLibFontkit> | null = null;

export function loadArchivalFontkit(): Promise<PdfLibFontkit> {
  if (!fontkitPromise) {
    fontkitPromise = import('@pdf-lib/fontkit').then((mod) => {
      const candidate = (mod as unknown as { default?: unknown }).default ?? mod;
      return candidate as PdfLibFontkit;
    });
  }
  return fontkitPromise;
}
