import { assertWriterOutputSnapshotCurrent, materializeWriterOutputSource, type WriterOutputSnapshot } from './writerOutputSnapshot';
import { useWriterV2Store } from '../writerV2Store';
import { exportRoundTripWriterPdf } from './roundTripPdfExport';

export interface ExportCurrentWriterRoundTripPdfInput {
  snapshot?: WriterOutputSnapshot;
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
  const snapshot = input.snapshot;
  const state = snapshot?.owner.writer ?? useWriterV2Store.getState();
  if (snapshot) assertWriterOutputSnapshotCurrent(snapshot);
  const documentFingerprint =
    input.documentFingerprint ?? state.currentDocumentFingerprint;

  if (snapshot && documentFingerprint !== snapshot.fingerprint) {
    throw new Error('Writer export fingerprint does not match captured document.');
  }
  if (!documentFingerprint) {
    throw new Error('Cannot export editable PDF without documentFingerprint.');
  }

  const source = snapshot ? await materializeWriterOutputSource(snapshot) : input.pdfBytes;
  if (!source) throw new Error('Editable Writer PDF requires PDF source bytes.');
  const result = await exportRoundTripWriterPdf({
    pdfBytes: source,
    elements: snapshot?.elements ?? state.elements,
    assets: state.assetRecords,
    documentFingerprint,
    documentMeta: snapshot?.documentMeta ?? state.documentMeta,
  });

  if (snapshot) assertWriterOutputSnapshotCurrent(snapshot);
  return result.bytes;
}
