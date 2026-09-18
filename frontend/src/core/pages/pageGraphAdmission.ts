import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  createPageGraph,
  isPageRotation,
} from './pageGraph';
import type { PageGraph, PageId, PageNode, PageRotation } from './types';

export async function buildPageGraphFromPdfBytes(
  bytes: Uint8Array,
  documentKey: string,
  signal?: AbortSignal,
): Promise<PageGraph<PageNode>> {
  throwIfAborted(signal, 'build PageGraph');

  const leasePromise = PdfRendererAdapter.acquireDocument(bytes);
  const lease = await raceWithAbort(
    leasePromise,
    signal,
    'load PDF for PageGraph',
    () => {
      void leasePromise.then((lateLease) => lateLease.release()).catch(() => undefined);
    },
  );

  try {
    const pages: PageNode[] = [];

    for (let pageNumber = 1; pageNumber <= lease.doc.numPages; pageNumber += 1) {
      throwIfAborted(signal, `read PageGraph metrics for page ${pageNumber}`);

      const pagePromise = lease.doc.getPage(pageNumber);
      const page = await raceWithAbort(
        pagePromise,
        signal,
        `load PDF page ${pageNumber} for PageGraph`,
        () => {
          void pagePromise.then((latePage) => latePage.cleanup()).catch(() => undefined);
        },
      );

      try {
        const viewport = page.getViewport({ scale: 1, rotation: 0 });
        const rotation = normalizePageRotation(page.rotate);

        pages.push({
          pageId: createInitialPageId(documentKey, pageNumber),
          documentKey,
          originalPageNumber: pageNumber,
          currentIndex: pageNumber - 1,
          width: viewport.width,
          height: viewport.height,
          rotation,
        });
      } finally {
        page.cleanup();
      }
    }

    return createPageGraph(pages);
  } finally {
    await lease.release();
  }
}

export function createInitialPageId(
  documentKey: string,
  sourcePageNumber: number,
): PageId {
  if (!documentKey.trim()) {
    throw new Error('PageGraph documentKey must not be empty');
  }
  if (!Number.isInteger(sourcePageNumber) || sourcePageNumber < 1) {
    throw new Error('PageGraph source page number must be a positive integer');
  }
  return `${documentKey}::page::${sourcePageNumber}`;
}

function normalizePageRotation(value: number): PageRotation {
  const normalized = ((value % 360) + 360) % 360;
  return isPageRotation(normalized) ? normalized : 0;
}
