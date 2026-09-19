import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type {
  HeaderFooterPdfWriter,
  HeaderFooterPdfWriteInput,
  HeaderFooterPdfWriteResult,
} from './pdfWriter';
import { createHeaderFooterPdfLibResources } from './pdfLibResources';
import { renderResolvedHeaderFooterPage } from './pdfLibPageRenderer';

export const pdfLibHeaderFooterWriter: HeaderFooterPdfWriter = {
  async write(
    input: HeaderFooterPdfWriteInput,
  ): Promise<HeaderFooterPdfWriteResult> {
    const lib = await pdfLib();
    const pdfDoc = await raceWithAbort(
      lib.PDFDocument.load(input.baseBytes),
      input.signal,
      'header/footer template: load PDF',
    );

    if (
      input.pages.some(
        (page) =>
          page.physicalPageNumber < 1
          || page.physicalPageNumber > pdfDoc.getPageCount(),
      )
    ) {
      throw new Error(
        'Header/footer execution plan references a page outside the PDF.',
      );
    }

    const resources = createHeaderFooterPdfLibResources(
      pdfDoc,
      lib,
      input.binaryResources,
    );

    for (const resolved of input.pages) {
      throwIfAborted(
        input.signal,
        'header/footer template: render page',
      );
      const page = pdfDoc.getPage(resolved.physicalPageNumber - 1);
      await renderResolvedHeaderFooterPage(
        page,
        resolved,
        resources,
        lib,
      );
    }

    const bytes = await raceWithAbort(
      pdfDoc.save(),
      input.signal,
      'header/footer template: save PDF',
    );

    return {
      bytes,
      warnings: resources.warnings(),
    };
  },
};
