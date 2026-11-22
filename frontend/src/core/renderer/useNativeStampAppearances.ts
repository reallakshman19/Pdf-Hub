import { useEffect, useState } from 'react';
import { AnnotationMode, type PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfAnnotation } from '@/core/annotations/types';
import { renderIsolatedNativeAppearances } from './nativeAppearanceFallback';
import { error as logError } from '@/core/logger/service';

// The cache is scoped to a PDF.js document instance. It is never written into
// the PDF or any shared store, and falls out of scope with the document.
const documents = new WeakMap<PDFDocumentProxy, Map<string, Promise<Map<string, string>>>>();

async function sourcePageAppearances(
  doc: PDFDocumentProxy,
  pageNumber: number,
  requestedRefs: readonly string[],
): Promise<Map<string, string>> {
  let pages = documents.get(doc);
  if (!pages) { pages = new Map(); documents.set(doc, pages); }
  const cacheKey = `${pageNumber}:${[...requestedRefs].sort().join(',')}`;
  const existing = pages.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    const page = await doc.getPage(pageNumber);
    try {
      const unit = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.sqrt(12_000_000 / Math.max(1, unit.width * unit.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot render native annotation appearance.');
      const separate = new Map<string, HTMLCanvasElement>();
      await page.render({ canvas, canvasContext: context, viewport, annotationMode: AnnotationMode.ENABLE, isEditing: true, annotationCanvasMap: separate }).promise;
      const images = new Map<string, string>();
      for (const [ref, appearance] of separate) {
        if (appearance.width > 0 && appearance.height > 0) images.set(ref, appearance.toDataURL('image/png'));
      }
      // Never crop a stamp from a normal page-render canvas: the crop
      // includes original page graphics and overlapping annotations, making
      // a non-flattened annotation appear visually flattened.


      // PDF.js normally draws FreeText/Line AP into the page operator list,
      // not annotationCanvasMap. Rendering/cropping the normal PDF page is
      // incorrect: it includes CAD artwork and possibly overlapping APs.
      // Produce transparent, single-annotation previews on temporary blank
      // PDF pages instead. Imported Stamp images already captured above stay
      // on their existing fast path.
      const missing = requestedRefs.filter((ref) => !images.has(ref));
      if (missing.length > 0) {
        try {
          const isolated = await renderIsolatedNativeAppearances(doc, pageNumber, missing);
          for (const [ref, url] of isolated) images.set(ref, url);
        } catch (err) {
          // A source annotation stays selectable via the editor fallback,
          // but the absence of original artwork must be diagnosable.
          logError('annotation', 'Could not isolate native PDF appearances', {
            pageNumber, count: missing.length, error: String(err),
          });
        }
      }
      return images;
    } finally {
      page.cleanup();
    }
  })();
  pages.set(cacheKey, request);
  request.catch(() => { if (pages?.get(cacheKey) === request) pages.delete(cacheKey); });
  return request;
}

/** Collect native /AP images without drawing them onto the background page canvas.
 * Retain the stamp API name as an alias for existing callers.
 */
export function useNativeAnnotationAppearances(doc: PDFDocumentProxy, annotations: PdfAnnotation[]): Record<string, string> {
  const requests = annotations
    .filter((item) => typeof item.data.nativeAppearanceRef === 'string'
      && (item.type === 'stamp' || (item.data.nativeAppearanceImported === true
        && ['textbox', 'callout', 'line', 'arrow', 'shape-rect', 'shape-ellipse', 'shape-cloud'].includes(item.type))))
    .map((item) => ({ ref: item.data.nativeAppearanceRef!, page: item.data.nativeCopySource?.pageNumber ?? item.pageNumber }));
  const requestKey = JSON.stringify(requests.sort((a, b) => a.page - b.page || a.ref.localeCompare(b.ref)));
  const [result, setResult] = useState<{
    doc: PDFDocumentProxy;
    requestKey: string;
    images: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const wanted = JSON.parse(requestKey) as Array<{ ref: string; page: number }>;
    if (!wanted.length) {
      return () => { active = false; };
    }
    const pageNumbers = [...new Set(wanted.map((item) => item.page))];
    void Promise.all(pageNumbers.map(async (number) => [
      number,
      await sourcePageAppearances(doc, number, wanted
        .filter((item) => item.page === number)
        .map((item) => item.ref)),
    ] as const))
      .then((entries) => {
        if (!active) return;
        const pages = new Map(entries);
        const next: Record<string, string> = {};
        for (const item of wanted) {
          const image = pages.get(item.page)?.get(item.ref);
          if (image) next[item.ref] = image;
        }
        setResult({ doc, requestKey, images: next });
      })
      .catch(() => {
        if (active) setResult({ doc, requestKey, images: {} });
      });
    return () => { active = false; };
  }, [doc, requestKey]);
  // PDF.js object IDs are only unique within their document. Never show
  // another file's appearance while the new document's images are loading.
  return result?.doc === doc && result.requestKey === requestKey
    ? result.images : {};
}

/** @deprecated Use the generic native annotation preview hook. */
export const useNativeStampAppearances = useNativeAnnotationAppearances;
