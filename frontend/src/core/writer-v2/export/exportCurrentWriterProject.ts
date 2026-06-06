import { useWriterV2Store } from '../writerV2Store';
import { exportPdfHubWriterProject } from './projectZip';

export interface ExportCurrentWriterProjectInput {
  originalPdfBytes?: Uint8Array | null;
  documentFingerprint?: string;
}

export async function exportCurrentWriterProject(
  input: ExportCurrentWriterProjectInput = {},
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const documentFingerprint =
    input.documentFingerprint
    ?? state.currentDocumentFingerprint
    ?? state.documentMeta?.documentFingerprint;

  if (!documentFingerprint) {
    throw new Error('Cannot export PDF Hub project without documentFingerprint.');
  }

  if (state.documentMeta?.mode !== 'blankDocument' && !input.originalPdfBytes) {
    throw new Error('Cannot export PDF overlay project without originalPdfBytes.');
  }

  const result = await exportPdfHubWriterProject({
    originalPdfBytes: input.originalPdfBytes,
    documentFingerprint,
    documentMeta: state.documentMeta,
    elements: state.elements,
    assets: state.assetRecords,
  });

  return result.bytes;
}
