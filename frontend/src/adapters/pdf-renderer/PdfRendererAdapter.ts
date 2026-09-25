import {
  AnnotationMode,
  GlobalWorkerOptions,
  type PageViewport,
  Util,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';

import { error } from '@/core/logger/service';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { pdfDocumentLeaseCache } from './PdfDocumentLeaseCache';
import type {
  AcquirePdfDocumentSourceInput,
  PdfDocumentCacheDiagnostics,
  PdfDocumentLease,
  PdfDocumentSourceCacheDiagnostics,
} from './PdfDocumentLeaseCache';
import type { ExistingTextSourceItem } from '@/core/existing-text/types';
import type { RenderToken } from './types';

export type {
  AcquirePdfDocumentSourceInput,
  PdfDocumentCacheDiagnostics,
  PdfDocumentLease,
  PdfDocumentSourceCacheDiagnostics,
};

export interface RenderedPage {
  width: number;
  height: number;
  scale: number;
}

export interface ThumbnailRenderResource {
  imageUrl: string;
  width: number;
  height: number;
  estimatedDecodedBytes: number;
  dispose: () => void;
}

export interface TextLayerItem {
  id: string;
  sourceIndex?: number;
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

export interface PageDimensions {
  width: number;
  height: number;
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

function toExistingTextSourceItem(
  value: unknown,
  sourceIndex: number,
): ExistingTextSourceItem | null {
  if (
    typeof value !== 'object'
    || value === null
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;
  if (
    typeof record.str !== 'string'
    || !Array.isArray(
      record.transform,
    )
    || record.transform.length < 6
  ) {
    return null;
  }

  const transform =
    record.transform
      .slice(0, 6)
      .map((entry) =>
        typeof entry === 'number'
          ? entry
          : Number.NaN,
      ) as unknown as ExistingTextSourceItem['transform'];

  return {
    sourceIndex,
    text: record.str,
    transform,
    width:
      typeof record.width === 'number'
        ? record.width
        : Number.NaN,
    height:
      typeof record.height === 'number'
        ? record.height
        : Number.NaN,
    ...(typeof record.fontName
      === 'string'
      ? {
          fontName:
            record.fontName,
        }
      : {}),
    ...(typeof record.dir
      === 'string'
      ? {
          direction:
            record.dir,
        }
      : {}),
    hasEol:
      record.hasEOL === true,
  };
}

function isTransportDestroyedError(err: unknown): boolean {
  return String(err).toLowerCase().includes('transport destroyed');
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export class PdfRendererAdapter {
  private static workerConfigured = false;
  static acquireDocument(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<PdfDocumentLease> {
    return pdfDocumentLeaseCache.acquireDocument(
      buffer,
    );
  }

  static acquireDocumentSource(
    input: AcquirePdfDocumentSourceInput,
  ): Promise<PdfDocumentLease> {
    return pdfDocumentLeaseCache.acquireDocumentSource(
      input,
    );
  }

  static getDocumentCacheDiagnostics():
  PdfDocumentCacheDiagnostics {
    return pdfDocumentLeaseCache.getDiagnostics();
  }

  static getDocumentSourceCacheDiagnostics():
  PdfDocumentSourceCacheDiagnostics[] {
    return pdfDocumentLeaseCache.getSourceDiagnostics();
  }

  static clearDocumentCache(
    options: { force?: boolean } = {},
  ): Promise<void> {
    return pdfDocumentLeaseCache.clear(options);
  }

  static isTransportDestroyedError(err: unknown): boolean {
    return isTransportDestroyedError(err);
  }

  static renderPage(
    page: PDFPageProxy,
    canvas: HTMLCanvasElement,
    viewport: PageViewport,
    options: { annotationMode?: number; signal?: AbortSignal } = {},
  ): RenderToken {
    type RenderOptions = Parameters<PDFPageProxy['render']>[0];
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('[PdfRendererAdapter] Could not get 2d context from canvas');

    canvas.width = Math.floor(viewport.width);
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
      annotationMode: options.annotationMode ?? AnnotationMode.DISABLE,
    });

    let cancelled = false;
    const renderPromise = renderTask.promise.catch((renderError) => {
      if (cancelled) return;
      throw renderError;
    });
    const completed = raceWithAbort(
      renderPromise,
      options.signal,
      `render PDF page ${page.pageNumber}`,
      () => {
        cancelled = true;
        renderTask.cancel();
      },
    );

    return {
      cancel: async () => {
        if (cancelled) return;
        cancelled = true;
        renderTask.cancel();
        await renderPromise;
      },
      completed,
    };
  }

  static async getPageTextItems(
    page: PDFPageProxy,
    scale: number,
    signal?: AbortSignal,
  ): Promise<TextLayerItem[]> {
    try {
      throwIfAborted(signal, `read text from PDF page ${page.pageNumber}`);
      const viewport = page.getViewport({ scale });
      const textContent = await raceWithAbort(
        page.getTextContent(),
        signal,
        `read text from PDF page ${page.pageNumber}`,
      );
      throwIfAborted(signal, `build text layer for PDF page ${page.pageNumber}`);

      return textContent.items.flatMap((item, index) => {
        if (!isTransformItem(item)) return [];

        const tx = Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(tx[2], tx[3]);
        const width = Math.max(4, item.width * scale);
        const emHeight = Math.max(8, fontSize);
        const descender = emHeight * 0.2;
        const height = emHeight + descender;

        return [{
          id: `page-${page.pageNumber}-text-${index}`,
          sourceIndex: index,
          text: item.str,
          x: tx[4],
          y: tx[5] - emHeight,
          width,
          height,
          fontSize,
        }];
      });
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to build text layer', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return [];
    }
  }

  static async getPageExistingTextSourceItems(
    page: PDFPageProxy,
    signal?: AbortSignal,
  ): Promise<ExistingTextSourceItem[]> {
    try {
      throwIfAborted(
        signal,
        `inspect text source on PDF page ${page.pageNumber}`,
      );
      const textContent =
        await raceWithAbort(
          page.getTextContent(),
          signal,
          `inspect text source on PDF page ${page.pageNumber}`,
        );
      throwIfAborted(
        signal,
        `normalize text source on PDF page ${page.pageNumber}`,
      );

      return textContent.items
        .map((item, sourceIndex) =>
          toExistingTextSourceItem(
            item,
            sourceIndex,
          ),
        )
        .filter(
          (
            item,
          ): item is ExistingTextSourceItem =>
            item !== null,
        );
    } catch (err) {
      if (
        isOperationCancelledError(err)
      ) {
        throw err;
      }
      error(
        'pdf-renderer',
        'Failed to inspect PDF text source',
        {
          pageNumber:
            page.pageNumber,
          error: String(err),
        },
      );
      return [];
    }
  }

  static getPageDimensions(page: PDFPageProxy): PageDimensions {
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  static async renderThumbnailResource(
    page: PDFPageProxy,
    signal?: AbortSignal,
    targetWidth = 150,
  ): Promise<ThumbnailRenderResource> {
    throwIfAborted(signal, `render thumbnail resource for PDF page ${page.pageNumber}`);
    const sourceViewport = page.getViewport({ scale: 1 });
    const widthScale = Math.max(1, targetWidth) / Math.max(1, sourceViewport.width);
    const heightScale = 300 / Math.max(1, sourceViewport.height);
    const scaledViewport = page.getViewport({ scale: Math.min(widthScale, heightScale) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(scaledViewport.width));
    canvas.height = Math.max(1, Math.floor(scaledViewport.height));
    const renderedWidth = canvas.width;
    const renderedHeight = canvas.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is not available for thumbnail');

    let objectUrl: string | null = null;
    try {
      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport: scaledViewport,
        annotationMode: AnnotationMode.DISABLE,
      });
      await raceWithAbort(
        renderTask.promise,
        signal,
        `render thumbnail resource for PDF page ${page.pageNumber}`,
        () => renderTask.cancel(),
      );
      throwIfAborted(signal, `encode thumbnail resource for PDF page ${page.pageNumber}`);

      const blob = typeof canvas.toBlob === 'function'
        ? await raceWithAbort(
            canvasToBlob(canvas, 'image/jpeg', 0.8),
            signal,
            `encode thumbnail blob for PDF page ${page.pageNumber}`,
          )
        : null;
      throwIfAborted(signal, `publish thumbnail resource for PDF page ${page.pageNumber}`);

      const imageUrl = blob && typeof URL.createObjectURL === 'function'
        ? (objectUrl = URL.createObjectURL(blob))
        : canvas.toDataURL('image/jpeg', 0.8);
      let disposed = false;

      return {
        imageUrl,
        width: renderedWidth,
        height: renderedHeight,
        estimatedDecodedBytes: renderedWidth * renderedHeight * 4,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          if (objectUrl && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
        },
      };
    } catch (thumbnailError) {
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
      throw thumbnailError;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  static async getThumbnail(
    page: PDFPageProxy,
    signal?: AbortSignal,
  ): Promise<string> {
    throwIfAborted(signal, `render thumbnail for PDF page ${page.pageNumber}`);
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 150 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is not available for thumbnail');

    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    });
    await raceWithAbort(
      renderTask.promise,
      signal,
      `render thumbnail for PDF page ${page.pageNumber}`,
      () => renderTask.cancel(),
    );
    throwIfAborted(signal, `encode thumbnail for PDF page ${page.pageNumber}`);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  static async getPagePlainText(
    page: PDFPageProxy,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      throwIfAborted(signal, `read plain text from PDF page ${page.pageNumber}`);
      const textContent = await raceWithAbort(
        page.getTextContent(),
        signal,
        `read plain text from PDF page ${page.pageNumber}`,
      );
      throwIfAborted(signal, `normalize text from PDF page ${page.pageNumber}`);
      const chunks = textContent.items.map((item) => {
        if ('str' in item && typeof item.str === 'string') return item.str;
        return '';
      });
      return chunks.join(' ').replace(/\s+/g, ' ').trim();
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to read page text', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return '';
    }
  }

  static async searchDocumentText(
    bytes: Uint8Array,
    query: string,
    signal?: AbortSignal,
  ): Promise<TextSearchHit[]> {
    if (!query.trim()) return [];

    throwIfAborted(signal, 'start PDF text search');
    const leasePromise = this.acquireDocument(bytes);
    const lease = await raceWithAbort(
      leasePromise,
      signal,
      'load PDF for text search',
      () => {
        void leasePromise.then((lateLease) => lateLease.release()).catch(() => undefined);
      },
    );

    try {
      return await this.searchDocumentTextInDocument(
        lease.doc,
        query,
        signal,
      );
    } finally {
      await lease.release();
    }
  }

  static async searchDocumentTextInDocument(
    doc: PDFDocumentProxy,
    query: string,
    signal?: AbortSignal,
  ): Promise<TextSearchHit[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    throwIfAborted(signal, 'start loaded PDF text search');
    const hits: TextSearchHit[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      throwIfAborted(signal, `search PDF page ${pageNumber}`);
      const pagePromise = doc.getPage(pageNumber);
      const page = await raceWithAbort(
        pagePromise,
        signal,
        `load PDF page ${pageNumber} for search`,
        () => {
          void pagePromise.then((latePage) => latePage.cleanup()).catch(() => undefined);
        },
      );

      try {
        const textItems = await this.getPageTextItems(page, 1.0, signal);
        let fullText = '';
        const itemMap: {
          start: number;
          end: number;
          item: TextLayerItem;
        }[] = [];

        for (const item of textItems) {
          throwIfAborted(signal, `index PDF page ${pageNumber}`);
          const start = fullText.length;
          fullText += `${item.text} `;
          itemMap.push({
            start,
            end: fullText.length - 1,
            item,
          });
        }

        const lowerText = fullText.toLowerCase();
        let idx = lowerText.indexOf(normalizedQuery);
        let hitCount = 0;

        while (idx !== -1) {
          throwIfAborted(
            signal,
            `collect search hits on PDF page ${pageNumber}`,
          );
          const matchEnd = idx + normalizedQuery.length;
          const hitItems = itemMap.filter(
            (entry) =>
              entry.start < matchEnd && entry.end > idx,
          );
          const startSnippetIdx = Math.max(0, idx - 20);
          const endSnippetIdx = Math.min(
            fullText.length,
            matchEnd + 20,
          );
          let snippet = fullText.substring(
            startSnippetIdx,
            endSnippetIdx,
          );
          if (startSnippetIdx > 0) snippet = `...${snippet}`;
          if (endSnippetIdx < fullText.length) {
            snippet = `${snippet}...`;
          }

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
          idx = lowerText.indexOf(
            normalizedQuery,
            idx + 1,
          );
        }
      } finally {
        page.cleanup();
      }
    }

    return hits;
  }

  static async getOutlineFlat(
    doc: PDFDocumentProxy,
    signal?: AbortSignal,
  ): Promise<OutlineItem[]> {
    try {
      throwIfAborted(signal, 'load PDF outline');
      const outline = await raceWithAbort(doc.getOutline(), signal, 'load PDF outline');
      if (!outline) return [];

      const flat: OutlineItem[] = [];
      let counter = 0;
      const walk = async (
        nodes: NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>,
        depth: number,
      ): Promise<void> => {
        for (const node of nodes) {
          throwIfAborted(signal, 'walk PDF outline');
          let pageNumber: number | null = null;
          try {
            let destinationRef: unknown = null;
            if (Array.isArray(node.dest)) {
              destinationRef = node.dest[0];
            } else if (typeof node.dest === 'string') {
              const destination = await raceWithAbort(
                doc.getDestination(node.dest),
                signal,
                'resolve PDF outline destination',
              );
              if (Array.isArray(destination)) destinationRef = destination[0];
            }
            if (destinationRef) {
              const pageIndex = await raceWithAbort(
                doc.getPageIndex(destinationRef as never),
                signal,
                'resolve PDF outline page',
              );
              pageNumber = pageIndex + 1;
            }
          } catch (outlineError) {
            if (isOperationCancelledError(outlineError)) throw outlineError;
            pageNumber = null;
          }

          flat.push({
            id: `outline-${counter}`,
            title: node.title || `Bookmark ${counter + 1}`,
            pageNumber,
            depth,
          });
          counter += 1;
          if (node.items && node.items.length > 0) await walk(node.items, depth + 1);
        }
      };

      await walk(outline, 0);
      return flat;
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to load document outline', { error: String(err) });
      return [];
    }
  }
}

