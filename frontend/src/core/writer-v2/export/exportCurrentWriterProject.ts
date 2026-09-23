import { useWriterV2Store } from '../writerV2Store';
import {
  exportPdfHubWriterProject,
  type ExportPdfHubProjectInput,
  type ExportPdfHubProjectResult,
} from './projectZip';
import {
  createOcrProjectPayloadFromStore,
} from '@/core/ocr/ocrHydrationBridge';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  createDefaultExportWorkerClient,
  type ExportWorkerClient,
} from '@/core/export/exportWorkerClient';

export interface ExportCurrentWriterProjectInput {
  originalPdfBytes?: Uint8Array | null;
  documentFingerprint?: string;
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

  const ocrStore = useOcrStore.getState();
  const includeOcrProject =
    ocrStore.documentFingerprint === documentFingerprint
    && Boolean(
      ocrStore.result
      || ocrStore.resumeToken
      || ocrStore.corrections.length > 0
      || ocrStore.regions.length > 0,
    );

  const packInput: ExportPdfHubProjectInput = {
    originalPdfBytes: input.originalPdfBytes,
    documentFingerprint,
    documentMeta: state.documentMeta,
    elements: state.elements,
    assets: state.assetRecords,
    ocrProject: includeOcrProject
      ? createOcrProjectPayloadFromStore({
          documentFingerprint,
          store: ocrStore,
        })
      : null,
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
