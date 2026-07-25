import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  cacheThumbnailRender,
  getThumbnailRenderCacheKey,
  thumbnailRenderCache,
  type RenderResourceLease,
  type ThumbnailRenderCacheValue,
} from '@/core/renderer/renderResourceCache';
import {
  pdfRenderScheduler,
  type RenderScheduleRequest,
} from '@/core/renderer/renderScheduler';

export interface ScheduledThumbnailRequest {
  doc: PDFDocumentProxy;
  documentKey: string;
  pageNumber: number;
  priority: number;
  signal?: AbortSignal;
  targetWidth?: number;
}

export async function acquireScheduledThumbnail(
  request: ScheduledThumbnailRequest,
): Promise<RenderResourceLease<ThumbnailRenderCacheValue>> {
  const targetWidth = request.targetWidth ?? 150;
  const cacheKey = getThumbnailRenderCacheKey(
    request.documentKey,
    request.pageNumber,
    targetWidth,
  );
  const cached = thumbnailRenderCache.acquire(cacheKey);
  if (cached) return cached;

  const scheduleRequest: RenderScheduleRequest<void> = {
    key: `thumbnail:${cacheKey}`,
    priority: request.priority,
    signal: request.signal,
    run: async (signal) => {
      const alreadyRendered = thumbnailRenderCache.acquire(cacheKey);
      if (alreadyRendered) {
        alreadyRendered.release();
        return;
      }

      const pagePromise = request.doc.getPage(request.pageNumber);
      const page = await raceWithAbort(
        pagePromise,
        signal,
        `load PDF page ${request.pageNumber} for thumbnail`,
        () => {
          void pagePromise
            .then((latePage) => latePage.cleanup())
            .catch(() => undefined);
        },
      );

      try {
        throwIfAborted(signal, `prepare PDF page ${request.pageNumber} thumbnail`);
        const viewport = page.getViewport({ scale: 1 });
        const resource = await PdfRendererAdapter.renderThumbnailResource(
          page,
          signal,
          targetWidth,
        );
        const cachedValue: ThumbnailRenderCacheValue = {
          imageUrl: resource.imageUrl,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          estimatedDecodedBytes: resource.estimatedDecodedBytes,
          dispose: resource.dispose,
        };

        if (!cacheThumbnailRender(cacheKey, cachedValue)) {
          throw new Error(`Thumbnail bitmap exceeds cache budget for page ${request.pageNumber}.`);
        }
      } finally {
        page.cleanup();
      }
    },
  };

  await pdfRenderScheduler.schedule(scheduleRequest);
  throwIfAborted(request.signal, `use PDF page ${request.pageNumber} thumbnail`);

  const lease = thumbnailRenderCache.acquire(cacheKey);
  if (!lease) {
    throw new Error(`Thumbnail cache entry unavailable for page ${request.pageNumber}.`);
  }
  return lease;
}
