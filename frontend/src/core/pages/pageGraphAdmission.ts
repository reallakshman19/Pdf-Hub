import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  clearPdfPasswordForDocumentKey,
  classifyPdfPasswordError,
  setPdfPasswordForDocumentKey,
} from '@/core/pdf/passwordRegistry';
import {
  createPageGraph,
  isPageRotation,
} from './pageGraph';
import { readResolvedPdfPageLabels } from './pdfPageLabels';
import { readNativePdfPageLabelRanges } from './pdfPageLabelNativeReader';
import { applyResolvedPageLabels, withPageLabelRanges } from './pageLabels';
import type { PageGraph, PageId, PageNode, PageRotation } from './types';

export interface BuildPageGraphOptions {
  readonly password?: string;
}

export async function buildPageGraphFromPdfBytes(
  bytes: Uint8Array,
  documentKey: string,
  signal?: AbortSignal,
  options?: BuildPageGraphOptions,
): Promise<PageGraph<PageNode>> {
  throwIfAborted(signal, 'build PageGraph');

  if (options?.password !== undefined) {
    setPdfPasswordForDocumentKey(documentKey, options.password);
  }

  const leasePromise = PdfRendererAdapter.acquireDocument(
    bytes,
    options?.password !== undefined ? { password: options.password } : undefined,
  );
  let lease: Awaited<typeof leasePromise>;
  try {
    lease = await raceWithAbort(
      leasePromise,
      signal,
      'load PDF for PageGraph',
      () => {
        void leasePromise.then((lateLease) => lateLease.release()).catch(() => undefined);
      },
    );
  } catch (err) {
    if (classifyPdfPasswordError(err)) {
      clearPdfPasswordForDocumentKey(documentKey);
    }
    throw err;
  }

  try {
    const resolvedPageLabels = await readResolvedPdfPageLabels(
      lease.doc,
      signal,
    );
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

    // Recover the original /PageLabels rules, not only PDF.js' formatted
    // strings. Never accept a structural rewrite model whose labels disagree
    // with the PDF.js source reader (malformed trees remain resolved-only).
    const graph = createPageGraph(pages);
    const resolved = applyResolvedPageLabels(graph, resolvedPageLabels);
    if (resolvedPageLabels) {
      const nativeRanges = await readNativePdfPageLabelRanges(
        bytes,
        pages.map((page) => page.pageId),
        signal,
      );
      if (nativeRanges) {
        const canonical = withPageLabelRanges(graph, nativeRanges);
        if (canonical.pages.every(
          (page, index) => page.logicalLabel === resolvedPageLabels[index],
        )) {
          return canonical;
        }
      }
    }
    return resolved;
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
