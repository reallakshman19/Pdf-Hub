import { PDFDocument } from 'pdf-lib';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';
import { useWriterV2Store } from '../writerV2Store';

export interface ExportCurrentWriterPdfInput {
  pdfBytes?: Uint8Array | null;
}

export async function exportCurrentWriterPdf(
  input: ExportCurrentWriterPdfInput = {},
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const sourcePdfBytes = input.pdfBytes ?? await createBlankDocumentPdfBytes();

  const result = await exportFlattenedWriterPdf({
    pdfBytes: sourcePdfBytes,
    elements: state.elements,
    assets: state.assetRecords,
  });

  return result.bytes;
}

async function createBlankDocumentPdfBytes(): Promise<Uint8Array> {
  const meta = useWriterV2Store.getState().documentMeta;

  if (meta?.mode !== 'blankDocument') {
    throw new Error('No PDF bytes were provided for flattened Writer PDF export.');
  }

  const doc = await PDFDocument.create();
  const pageCount = Math.max(1, Math.floor(meta.pageCount));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    doc.addPage([meta.pageSetup.width, meta.pageSetup.height]);
  }

  return await doc.save();
}
