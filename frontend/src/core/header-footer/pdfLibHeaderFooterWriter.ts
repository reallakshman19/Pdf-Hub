import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';
import type {
  HeaderFooterPdfWriter,
  HeaderFooterPdfWriteInput,
  HeaderFooterPdfWriteResult,
} from './pdfWriter';
import { applyPdfLibHeaderFooterPlan } from '@/adapters/pdf-mutation/pdfLibHeaderFooter';

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

    const rendered = await applyPdfLibHeaderFooterPlan(
      pdfDoc,
      lib,
      input.pages,
      input.binaryResources,
      input.signal,
    );

    const bytes = await raceWithAbort(
      pdfDoc.save(),
      input.signal,
      'header/footer template: save PDF',
    );

    return {
      bytes,
      warnings: rendered.warnings,
    };
  },
};
