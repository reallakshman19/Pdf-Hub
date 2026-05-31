import { useWriterV2Store } from '../writerV2Store';
import { exportPdfHubWriterProject } from './projectZip';

export interface ExportCurrentWriterProjectInput {
  originalPdfBytes: Uint8Array;
  documentFingerprint?: string;
}

export async function exportCurrentWriterProject(
  input: ExportCurrentWriterProjectInput,
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const documentFingerprint =
    input.documentFingerprint ?? state.currentDocumentFingerprint;

  if (!documentFingerprint) {
    throw new Error('Cannot export PDF Hub project without documentFingerprint.');
  }

  const result = await exportPdfHubWriterProject({
    originalPdfBytes: input.originalPdfBytes,
    documentFingerprint,
    elements: state.elements,
    assets: state.assetRecords,
  });

  return result.bytes;
}
