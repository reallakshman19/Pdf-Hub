import { exportFlattenedWriterPdf } from './flattenedPdfExport';
import { useWriterV2Store } from '../writerV2Store';

export interface ExportCurrentWriterPdfInput {
  pdfBytes: Uint8Array;
}

export async function exportCurrentWriterPdf(
  input: ExportCurrentWriterPdfInput,
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();

  const result = await exportFlattenedWriterPdf({
    pdfBytes: input.pdfBytes,
    elements: state.elements,
    assets: state.assetRecords,
  });

  return result.bytes;
}
