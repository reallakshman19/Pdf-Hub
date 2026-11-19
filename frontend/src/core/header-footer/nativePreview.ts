import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { raceWithAbort, throwIfAborted } from '@/core/cancellation/operationCancellation';
import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import type { HeaderFooterResolutionContext } from './resolutionTypes';
import { executeHeaderFooterTemplateMutation } from './executeMutation';

export interface HeaderFooterNativePreviewInput {
  baseBytes: Uint8Array;
  pageGraph: PageGraph<PageNode>;
  template: HeaderFooterTemplate;
  context: HeaderFooterResolutionContext;
  binaryResources?: Readonly<Record<string, Uint8Array>>;
  physicalPageNumber: number;
  signal?: AbortSignal;
}

/**
 * Preview uses the exact native writer on detached PDF bytes, then renders
 * the selected physical page. No live session, command bus, or queue mutation.
 * Explicit user activation keeps large-PDF authoring responsive.
 */
export async function renderHeaderFooterNativePreview(
  input: HeaderFooterNativePreviewInput,
): Promise<{ dataUrl: string; warnings: string[] }> {
  throwIfAborted(input.signal, 'start header/footer native preview');
  if (!Number.isInteger(input.physicalPageNumber)
    || input.physicalPageNumber < 1
    || input.physicalPageNumber > input.pageGraph.pages.length) {
    throw new Error('Native preview page is not present in the page graph.');
  }
  const stamped = await executeHeaderFooterTemplateMutation(
    Uint8Array.from(input.baseBytes),
    input.pageGraph,
    input.template,
    input.context,
    input.binaryResources,
    input.signal,
  );
  if (!stamped.ok) throw new Error(stamped.errors.join(' '));
  throwIfAborted(input.signal, 'load native preview');
  const acquiring = PdfRendererAdapter.acquireDocument(stamped.bytes);
  const lease = await raceWithAbort(
    acquiring, input.signal, 'acquire native preview document',
    () => { void acquiring.then((late) => late.release()).catch(() => undefined); },
  );
  try {
    const page = await raceWithAbort(
      lease.doc.getPage(input.physicalPageNumber), input.signal, 'read native preview page',
    );
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(2, 480 / Math.max(1, baseViewport.width)),
    });
    const canvas = document.createElement('canvas');
    try {
      const token = PdfRendererAdapter.renderPage(
        page, canvas, viewport, { signal: input.signal },
      );
      await token.completed;
      throwIfAborted(input.signal, 'encode native preview');
      return { dataUrl: canvas.toDataURL('image/png'), warnings: stamped.warnings };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await lease.release();
  }
}
