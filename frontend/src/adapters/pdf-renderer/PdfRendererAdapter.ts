import {
  getDocument,
  GlobalWorkerOptions,
  type PageViewport,
  Util,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';

import { error } from '@/core/logger/service';
import type { RenderToken } from './types';


export interface RenderedPage {
  width: number;
  height: number;
  scale: number;
}

export interface TextLayerItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface SearchHitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSearchHit {
  id: string;
  pageNumber: number;
  snippet: string;
  rects: SearchHitRect[];
}

export interface OutlineItem {
  id: string;
  title: string;
  pageNumber: number | null;
  depth: number;
}

function isTransformItem(
  value: unknown,
): value is { str: string; transform: number[]; width: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'str' in value &&
    typeof (value as { str: unknown }).str === 'string' &&
    'transform' in value &&
    Array.isArray((value as { transform: unknown }).transform)
  );
}

export class PdfRendererAdapter {
  private static workerConfigured = false;

  static configureWorker(options: {
    workerSrc: string;
    cMapUrl?: string;
    standardFontDataUrl?: string;
  }): void {
    if (PdfRendererAdapter.workerConfigured) return;
    GlobalWorkerOptions.workerSrc = options.workerSrc;
    PdfRendererAdapter.workerConfigured = true;
  }

  private static cachedDoc: { bytes: Uint8Array | ArrayBuffer; doc: PDFDocumentProxy } | null = null;

  static async loadDocument(buffer: Uint8Array | ArrayBuffer): Promise<PDFDocumentProxy> {
    if (this.cachedDoc && this.cachedDoc.bytes === buffer) {
      return this.cachedDoc.doc;
    }

    try {
      // PDF.js may transfer typed-array buffers to the worker, which detaches them.
      // Clone input bytes so shared session state remains readable across reloads.
      const data =
        buffer instanceof Uint8Array
          ? new Uint8Array(buffer)
          : buffer.slice(0);

      const task = getDocument({ data });
      const doc = await task.promise;

      if (this.cachedDoc) {
        await this.cachedDoc.doc.destroy().catch(() => {});
      }
      this.cachedDoc = { bytes: buffer, doc };

      return doc;
    } catch (err) {
      error('pdf-renderer', 'Failed to load document', { error: String(err) });
      throw err;
    }
  }

  static renderPage(
    page: PDFPageProxy,
    canvas: HTMLCanvasElement,
    viewport: PageViewport,
    options: { annotationMode?: number } = {},
  ): RenderToken {
    type RenderOptions = Parameters<PDFPageProxy['render']>[0];
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('[PdfRendererAdapter] Could not get 2d context from canvas');

    canvas.width  = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      optionalContentConfigPromise:
        'getOptionalContentConfig' in page
          ? (
              page as unknown as {
                getOptionalContentConfig: () => NonNullable<RenderOptions['optionalContentConfigPromise']>;
              }
            ).getOptionalContentConfig()
          : undefined,
      annotationMode: options.annotationMode,
    });

    let cancelled = false;
    let resolveCancel!: () => void;
    const cancelPromise = new Promise<void>(res => { resolveCancel = res; });

    const completedPromise = renderTask.promise
      .then(() => { resolveCancel(); })
      .catch(err => {
        resolveCancel();
        if (!cancelled) throw err;
      });

    return {
      cancel: async () => {
        cancelled = true;
        renderTask.cancel();
        await cancelPromise;
      },
      completed: completedPromise,
    };
  }

  static async getPageTextItems(
    page: PDFPageProxy,
    scale: number,
  ): Promise<TextLayerItem[]> {
    try {
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();

      return textContent.items.flatMap((item, index) => {
        if (!isTransformItem(item)) {
          return [];
        }

        const tx = Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(tx[2], tx[3]);
        const width = Math.max(4, item.width * scale);
        // em-square height from PDF.js transform
        const emHeight = Math.max(8, fontSize);
        // In PDF, tx[5] is the text BASELINE in CSS pixels from page top.
        // Add a small descender allowance (≈20% of em) so the span fully
        // covers glyph descenders (g, p, y…) and the selection rect aligns
        // with the PDF-rendered canvas text.
        const descender = emHeight * 0.2;
        const height = emHeight + descender;

        return [
          {
            id: `page-${page.pageNumber}-text-${index}`,
            text: item.str,
            x: tx[4],
            // top = baseline - ascent (≈ em height), so descender space is below
            y: tx[5] - emHeight,
            width,
            height,
            fontSize,
          },
        ];
      });
    } catch (err) {
      error('pdf-renderer', 'Failed to build text layer', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return [];
    }
  }

  static async getThumbnail(page: PDFPageProxy): Promise<string> {
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 150 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D canvas context is not available for thumbnail');
    }

    await page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.8);
  }

  static async getPagePlainText(page: PDFPageProxy): Promise<string> {
    try {
      const textContent = await page.getTextContent();
      const chunks = textContent.items.map((item) => {
        if ('str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      });
      return chunks.join(' ').replace(/\s+/g, ' ').trim();
    } catch (err) {
      error('pdf-renderer', 'Failed to read page text', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return '';
    }
  }

  static async searchDocumentText(bytes: Uint8Array, query: string): Promise<TextSearchHit[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const doc = await this.loadDocument(bytes);
    try {
      const hits: TextSearchHit[] = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        try {
          const textItems = await this.getPageTextItems(page, 1.0);

          let fullText = '';
          const itemMap: { start: number; end: number; item: TextLayerItem }[] = [];

          for (const item of textItems) {
            const start = fullText.length;
            fullText += `${item.text} `;
            itemMap.push({ start, end: fullText.length - 1, item });
          }

          let idx = fullText.toLowerCase().indexOf(normalizedQuery);
          let hitCount = 0;

          while (idx !== -1) {
            const matchEnd = idx + normalizedQuery.length;
            const hitItems = itemMap.filter((entry) => entry.start < matchEnd && entry.end > idx);

            const startSnippetIdx = Math.max(0, idx - 20);
            const endSnippetIdx = Math.min(fullText.length, matchEnd + 20);
            let snippet = fullText.substring(startSnippetIdx, endSnippetIdx);

            if (startSnippetIdx > 0) snippet = `...${snippet}`;
            if (endSnippetIdx < fullText.length) snippet = `${snippet}...`;

            hits.push({
              id: `hit-${pageNumber}-${hitCount}`,
              pageNumber,
              snippet,
              rects: hitItems.map((entry) => ({
                x: entry.item.x,
                y: entry.item.y,
                width: entry.item.width,
                height: entry.item.height,
              })),
            });
            hitCount += 1;
            idx = fullText.toLowerCase().indexOf(normalizedQuery, idx + 1);
          }
        } finally {
          page.cleanup();
        }
      }

      return hits;
    } finally {
      // Keep shared cached document alive; its lifecycle is controlled by close points in the adapter.
    }
  }

  static async getOutlineFlat(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
    try {
      const outline = await doc.getOutline();
      if (!outline) {
        return [];
      }

      const flat: OutlineItem[] = [];
      let counter = 0;

      const walk = async (
        nodes: NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>,
        depth: number,
      ): Promise<void> => {
        for (const node of nodes) {
          let pageNumber: number | null = null;
          try {
            let destinationRef: unknown = null;
            if (Array.isArray(node.dest)) {
              destinationRef = node.dest[0];
            } else if (typeof node.dest === 'string') {
              const destination = await doc.getDestination(node.dest);
              if (Array.isArray(destination)) {
                destinationRef = destination[0];
              }
            }

            if (destinationRef) {
              const pageIndex = await doc.getPageIndex(destinationRef as never);
              pageNumber = pageIndex + 1;
            }
          } catch {
            pageNumber = null;
          }

          flat.push({
            id: `outline-${counter}`,
            title: node.title || `Bookmark ${counter + 1}`,
            pageNumber,
            depth,
          });
          counter += 1;

          if (node.items && node.items.length > 0) {
            await walk(node.items, depth + 1);
          }
        }
      };

      await walk(outline, 0);
      return flat;
    } catch (err) {
      error('pdf-renderer', 'Failed to load document outline', { error: String(err) });
      return [];
    }
  }
}
