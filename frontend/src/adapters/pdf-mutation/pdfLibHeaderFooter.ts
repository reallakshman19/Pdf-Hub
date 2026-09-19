import {
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type {
  PdfMutationHeaderFooterPage,
  PdfMutationHeaderFooterResult,
} from '@/core/pdf-mutation/types';
import { createHeaderFooterPdfLibResources } from '@/core/header-footer/pdfLibResources';
import { renderPdfMutationHeaderFooterPage } from '@/core/header-footer/pdfLibPageRenderer';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<
  ReturnType<typeof import('@/core/pdf/lazyPdfLib').pdfLib>
>;

export async function applyPdfLibHeaderFooterPlan(
  document: PdfLibDocument,
  lib: PdfLibNamespace,
  pages: readonly PdfMutationHeaderFooterPage[],
  binaryResources: Readonly<Record<string, Uint8Array>>,
  signal?: AbortSignal,
): Promise<PdfMutationHeaderFooterResult> {
  for (const resolved of pages) {
    if (
      !Number.isInteger(resolved.pageIndex)
      || resolved.pageIndex < 0
      || resolved.pageIndex >= document.getPageCount()
    ) {
      throw new Error(
        'Header/footer execution plan references a page outside the PDF.',
      );
    }
  }

  const resources = createHeaderFooterPdfLibResources(
    document,
    lib,
    binaryResources,
  );

  for (const resolved of pages) {
    throwIfAborted(
      signal,
      'header/footer template: render page',
    );
    const page = document.getPage(resolved.pageIndex);
    await renderPdfMutationHeaderFooterPage(
      page,
      resolved,
      resources,
      lib,
    );
  }

  return {
    warnings: resources.warnings(),
  };
}
