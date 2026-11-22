import { useEffect, useState } from 'react';
import { AnnotationMode, type PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfAnnotation } from '@/core/annotations/types';

// The cache is scoped to a PDF.js document instance. It is never written into
// the PDF or any shared store, and falls out of scope with the document.
const documents = new WeakMap<PDFDocumentProxy, Map<number, Promise<Map<string, string>>>>();

async function sourcePageAppearances(doc: PDFDocumentProxy, pageNumber: number): Promise<Map<string, string>> {
  let pages = documents.get(doc);
  if (!pages) { pages = new Map(); documents.set(doc, pages); }
  const existing = pages.get(pageNumber);
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
      if (!context) throw new Error('Cannot render native stamp appearance.');
      const separate = new Map<string, HTMLCanvasElement>();
      await page.render({ canvas, canvasContext: context, viewport, annotationMode: AnnotationMode.ENABLE, isEditing: true, annotationCanvasMap: separate }).promise;
      const images = new Map<string, string>();
      for (const [ref, appearance] of separate) {
        if (appearance.width > 0 && appearance.height > 0) images.set(ref, appearance.toDataURL('image/png'));
      }
      try {
        const annots = await page.getAnnotations({ intent: 'display' });
        for (const annot of annots) {
          if (annot.subtype === 'Stamp' && !images.has(annot.id) && annot.rect) {
            const vrect = viewport.convertToViewportRectangle(annot.rect);
            const sx = Math.floor(Math.min(vrect[0], vrect[2]));
            const sy = Math.floor(Math.min(vrect[1], vrect[3]));
            const sw = Math.ceil(Math.abs(vrect[2] - vrect[0]));
            const sh = Math.ceil(Math.abs(vrect[3] - vrect[1]));
            if (sw > 0 && sh > 0 && sx >= 0 && sy >= 0 && sx + sw <= canvas.width && sy + sh <= canvas.height) {
              const stampCanvas = document.createElement('canvas');
              stampCanvas.width = sw;
              stampCanvas.height = sh;
              const stampCtx = stampCanvas.getContext('2d');
              if (stampCtx) {
                stampCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
                images.set(annot.id, stampCanvas.toDataURL('image/png'));
              }
            }
          }
        }
      } catch {
        // Fall back gracefully to separate map
      }
      return images;
    } finally {
      page.cleanup();
    }
  })();
  pages.set(pageNumber, request);
  request.catch(() => { if (pages?.get(pageNumber) === request) pages.delete(pageNumber); });
  return request;
}

/** Render native appearances separately, so editable overlays never duplicate page content. */
export function useNativeStampAppearances(doc: PDFDocumentProxy, annotations: PdfAnnotation[]): Record<string, string> {
  const requests = annotations
    .filter((item) => item.type === 'stamp' && typeof item.data.nativeAppearanceRef === 'string')
    .map((item) => ({ ref: item.data.nativeAppearanceRef!, page: item.data.nativeCopySource?.pageNumber ?? item.pageNumber }));
  const requestKey = JSON.stringify(requests.sort((a, b) => a.page - b.page || a.ref.localeCompare(b.ref)));
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const wanted = JSON.parse(requestKey) as Array<{ ref: string; page: number }>;
    if (!wanted.length) { setImages({}); return () => { active = false; }; }
    const pageNumbers = [...new Set(wanted.map((item) => item.page))];
    void Promise.all(pageNumbers.map(async (number) => [number, await sourcePageAppearances(doc, number)] as const))
      .then((entries) => {
        if (!active) return;
        const pages = new Map(entries);
        const next: Record<string, string> = {};
        for (const item of wanted) {
          const image = pages.get(item.page)?.get(item.ref);
          if (image) next[item.ref] = image;
        }
        setImages(next);
      })
      .catch(() => { if (active) setImages({}); });
    return () => { active = false; };
  }, [doc, requestKey]);
  return images;
}
