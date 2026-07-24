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

export interface PdfDocumentLease {
  readonly doc: PDFDocumentProxy;
  readonly cacheKey: string;
  release: () => Promise<void>;
}

export interface PdfDocumentCacheDiagnostics {
  entries: number;
  activeLeases: number;
  idleEntries: number;
  maxEntries: number;
}

interface PdfDocumentCacheEntry {
  key: string;
  docPromise: Promise<PDFDocumentProxy>;
  doc: PDFDocumentProxy | null;
  refCount: number;
  lastUsed: number;
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

function isTransportDestroyedError(err: unknown): boolean {
  return String(err).toLowerCase().includes('transport destroyed');
}

function clonePdfBytes(buffer: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  return buffer instanceof Uint8Array
    ? Uint8Array.from(buffer)
    : new Uint8Array(buffer.slice(0));
}

function digestHex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digestInput = Uint8Array.from(bytes).buffer;
  return crypto.subtle.digest('SHA-256', digestInput).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join(''),
  );
}

export class PdfRendererAdapter {
  private static workerConfigured = false;
  private static readonly MAX_CACHED_DOCUMENTS = 2;
  private static documentCache = new Map<string, PdfDocumentCacheEntry>();
  private static sourceKeyCache = new WeakMap<object, Promise<string>>();
  private static accessCounter = 0;

  static configureWorker(options: {
    workerSrc: string;
    cMapUrl?: string;
    standardFontDataUrl?: string;
  }): void {
    if (PdfRendererAdapter.workerConfigured) return;
    GlobalWorkerOptions.workerSrc = options.workerSrc;
    PdfRendererAdapter.workerConfigured = true;
  }

  private static keyForBuffer(buffer: Uint8Array | ArrayBuffer): Promise<string> {
    const source = buffer as object;
    const cached = this.sourceKeyCache.get(source);
    if (cached) return cached;

    const keyPromise = digestHex(clonePdfBytes(buffer)).then((hex) => `sha256:${hex}`);
    this.sourceKeyCache.set(source, keyPromise);
    return keyPromise;
  }

  private static createCacheEntry(
    key: string,
    buffer: Uint8Array | ArrayBuffer,
  ): PdfDocumentCacheEntry {
    const entry: PdfDocumentCacheEntry = {
      key,
      docPromise: Promise.resolve(null as unknown as PDFDocumentProxy),
      doc: null,
      refCount: 0,
      lastUsed: ++this.accessCounter,
    };
    const task = getDocument({ data: clonePdfBytes(buffer) });
    entry.docPromise = task.promise
      .then((doc) => {
        entry.doc = doc;
        return doc;
      })
      .catch((loadError) => {
        if (this.documentCache.get(key) === entry) {
          this.documentCache.delete(key);
        }
        throw loadError;
      });
    void entry.docPromise.catch(() => undefined);
    this.documentCache.set(key, entry);
    return entry;
  }

  private static async destroyEntry(entry: PdfDocumentCacheEntry): Promise<void> {
    const doc = entry.doc ?? await entry.docPromise.catch(() => null);
    if (!doc) return;

    try {
      await doc.destroy();
    } catch (destroyError) {
      error('pdf-renderer', 'Failed to destroy cached PDF document', {
        cacheKey: entry.key,
        error: String(destroyError),
      });
    }
  }

  private static async evictIdleDocuments(): Promise<void> {
    while (this.documentCache.size > this.MAX_CACHED_DOCUMENTS) {
      const candidate = Array.from(this.documentCache.values())
        .filter((entry) => entry.refCount === 0 && entry.doc !== null)
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!candidate) return;

      this.documentCache.delete(candidate.key);
      await this.destroyEntry(candidate);
    }
  }

  static async acquireDocument(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<PdfDocumentLease> {
    const key = await this.keyForBuffer(buffer);
    const entry = this.documentCache.get(key) ?? this.createCacheEntry(key, buffer);
    entry.refCount += 1;
    entry.lastUsed = ++this.accessCounter;

    try {
      const doc = await entry.docPromise;
      await this.evictIdleDocuments();
      let released = false;

      return {
        doc,
        cacheKey: key,
        release: async () => {
          if (released) return;
          released = true;

          if (this.documentCache.get(key) !== entry) return;
          entry.refCount = Math.max(0, entry.refCount - 1);
          entry.lastUsed = ++this.accessCounter;
          await this.evictIdleDocuments();
        },
      };
    } catch (loadError) {
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (this.documentCache.get(key) === entry) {
        this.documentCache.delete(key);
      }
      error('pdf-renderer', 'Failed to load document', { error: String(loadError) });
      throw loadError;
    }
  }

  static getDocumentCacheDiagnostics(): PdfDocumentCacheDiagnostics {
    const entries = Array.from(this.documentCache.values());
    return {
      entries: entries.length,
      activeLeases: entries.reduce((sum, entry) => sum + entry.refCount, 0),
      idleEntries: entries.filter((entry) => entry.refCount === 0).length,
      maxEntries: this.MAX_CACHED_DOCUMENTS,
    };
  }

  static async clearDocumentCache(options: { force?: boolean } = {}): Promise<void> {
    const targets = Array.from(this.documentCache.values())
      .filter((entry) => options.force === true || entry.refCount === 0);

    for (const entry of targets) {
      if (this.documentCache.get(entry.key) !== entry) continue;
      this.documentCache.delete(entry.key);
      await this.destroyEntry(entry);
    }
  }

  static isTransportDestroyedError(err: unknown): boolean {
    return isTransportDestroyedError(err);
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
        const emHeight = Math.max(8, fontSize);
        const descender = emHeight * 0.2;
        const height = emHeight + descender;

        return [
          {
            id: `page-${page.pageNumber}-text-${index}`,
            text: item.str,
            x: tx[4],
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

  static getPageDimensions(page: PDFPageProxy): PageDimensions {
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
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

    const lease = await this.acquireDocument(bytes);
    const doc = lease.doc;
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
      await lease.release();
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
