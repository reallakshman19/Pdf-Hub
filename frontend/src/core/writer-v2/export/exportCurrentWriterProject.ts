import { useWriterV2Store } from '../writerV2Store';
import { validateOcrProjectPayload, type OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import {
  exportPdfHubWriterProject,
  type ExportPdfHubProjectInput,
  type ExportPdfHubProjectResult,
} from './projectZip';
import {
  createDefaultExportWorkerClient,
  type ExportWorkerClient,
} from '@/core/export/exportWorkerClient';

export interface ExportCurrentWriterProjectInput {
  originalPdfBytes?: Uint8Array | null;
  documentFingerprint?: string;
  /** Optional same-document OCR snapshot captured by the Save Project caller. */
  ocrProject?: OcrProjectPayloadV1 | null;
  /**
   * Force main-thread (false) or worker (true) execution. Defaults to
   * `typeof Worker !== 'undefined'` — see exportCurrentWriterPdf.ts for the
   * same pattern and rationale.
   */
  useWorker?: boolean;
  workerClient?: Pick<ExportWorkerClient, 'packProjectZip'>;
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

  if (input.ocrProject) {
    if (input.ocrProject.manifest.documentFingerprint !== documentFingerprint) {
      throw new Error('Cannot export OCR state belonging to a different document.');
    }
    if (!validateOcrProjectPayload(input.ocrProject).valid) {
      throw new Error('Cannot export invalid OCR project data.');
    }
  }

  const packInput: ExportPdfHubProjectInput = {
    originalPdfBytes: input.originalPdfBytes,
    documentFingerprint,
    documentMeta: state.documentMeta,
    elements: state.elements,
    assets: state.assetRecords,
    ocrProject: input.ocrProject ?? null,
  };

  const shouldUseWorker = input.useWorker ?? typeof Worker !== 'undefined';

  const result = shouldUseWorker
    ? await runPackProjectZipViaWorker(packInput, input.workerClient)
    : await exportPdfHubWriterProject(packInput);

  return result.bytes;
}

async function runPackProjectZipViaWorker(
  payload: ExportPdfHubProjectInput,
  injectedClient: Pick<ExportWorkerClient, 'packProjectZip'> | undefined,
): Promise<ExportPdfHubProjectResult> {
  if (injectedClient) {
    return injectedClient.packProjectZip(payload);
  }

  const client = createDefaultExportWorkerClient();
  try {
    return await client.packProjectZip(payload);
  } finally {
    client.dispose();
  }
}
