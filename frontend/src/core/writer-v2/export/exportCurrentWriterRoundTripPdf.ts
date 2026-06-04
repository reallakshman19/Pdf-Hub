import { useWriterV2Store } from '../writerV2Store';
import { exportRoundTripWriterPdf } from './roundTripPdfExport';

export interface ExportCurrentWriterRoundTripPdfInput {
  /** Source (un-flattened) PDF bytes — the editable original. */
  pdfBytes: Uint8Array;
  documentFingerprint?: string;
}

/**
 * Save the current Writer session as a single editable `.pdf` (Option C):
 * flattened for universal viewing, with the editable project embedded so it can
 * be re-opened and edited in PDF Hub.
 */
export async function exportCurrentWriterRoundTripPdf(
  input: ExportCurrentWriterRoundTripPdfInput,
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const documentFingerprint =
    input.documentFingerprint ?? state.currentDocumentFingerprint;

  if (!documentFingerprint) {
    throw new Error('Cannot export editable PDF without documentFingerprint.');
  }

  const result = await exportRoundTripWriterPdf({
    pdfBytes: input.pdfBytes,
    elements: state.elements,
    assets: state.assetRecords,
    documentFingerprint,
  });

  return result.bytes;
}
