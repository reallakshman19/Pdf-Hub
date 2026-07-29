import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  exportFlattenedWriterPdf,
  type FlattenWriterExportInput,
  type FlattenWriterExportResult,
} from './flattenedPdfExport';
import { useWriterV2Store } from '../writerV2Store';
import {
  createDefaultExportWorkerClient,
  type ExportWorkerClient,
} from '@/core/export/exportWorkerClient';

export interface ExportCurrentWriterPdfInput {
  pdfBytes?: Uint8Array | null;
  /**
   * Force main-thread (false) or worker (true) execution. Defaults to
   * `typeof Worker !== 'undefined'` — real browsers offload to the export
   * worker automatically; environments without a Worker implementation
   * (e.g. this test suite's jsdom environment) fall back to the direct
   * main-thread path with no behavior change.
   */
  useWorker?: boolean;
  workerClient?: Pick<ExportWorkerClient, 'flattenPdf'>;
}

export async function exportCurrentWriterPdf(
  input: ExportCurrentWriterPdfInput = {},
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const sourcePdfBytes = input.pdfBytes ?? await createBlankDocumentPdfBytes();

  const flattenInput: FlattenWriterExportInput = {
    pdfBytes: sourcePdfBytes,
    elements: state.elements,
    assets: state.assetRecords,
  };

  const shouldUseWorker = input.useWorker ?? typeof Worker !== 'undefined';

  const result = shouldUseWorker
    ? await runFlattenPdfViaWorker(flattenInput, input.workerClient)
    : await exportFlattenedWriterPdf(flattenInput);

  return result.bytes;
}

async function runFlattenPdfViaWorker(
  payload: FlattenWriterExportInput,
  injectedClient: Pick<ExportWorkerClient, 'flattenPdf'> | undefined,
): Promise<FlattenWriterExportResult> {
  if (injectedClient) {
    return injectedClient.flattenPdf(payload);
  }

  const client = createDefaultExportWorkerClient();
  try {
    return await client.flattenPdf(payload);
  } finally {
    client.dispose();
  }
}

async function createBlankDocumentPdfBytes(): Promise<Uint8Array> {
  const meta = useWriterV2Store.getState().documentMeta;

  if (meta?.mode !== 'blankDocument') {
    throw new Error('No PDF bytes were provided for flattened Writer PDF export.');
  }

  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const pageCount = Math.max(1, Math.floor(meta.pageCount));
  const background = await cssHexToPdfRgb(meta.pageSetup.backgroundColor ?? '#ffffff');

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = doc.addPage([meta.pageSetup.width, meta.pageSetup.height]);

    if (background) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: meta.pageSetup.width,
        height: meta.pageSetup.height,
        color: background,
        borderWidth: 0,
      });
    }
  }

  return await doc.save();
}

export async function cssHexToPdfRgb(color: string) {
  const trimmed = color.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);

  if (!match) {
    return null;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  const { rgb } = await pdfLib();
  return rgb(red, green, blue);
}
