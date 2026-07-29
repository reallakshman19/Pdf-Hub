import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';
import { exportPdfHubWriterProject } from './projectZip';
import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

/**
 * Name of the embedded attachment that carries the editable Writer project
 * (the same ZIP payload produced by {@link exportPdfHubWriterProject}) inside a
 * flattened, universally-viewable PDF. This is the "Option C" round-trip:
 * the saved file is a normal `.pdf` everywhere, but PDF Hub can re-open it and
 * restore a fully editable overlay.
 */
export const ROUND_TRIP_ATTACHMENT_NAME = 'pdfhub-project.pdfhub.zip';

export interface ExportRoundTripWriterPdfInput {
  /** Source (un-flattened) PDF bytes — the editable original. */
  pdfBytes: Uint8Array;
  elements: WriterElementV2[];
  assets?: WriterAssetRecordV2[];
  documentFingerprint: string;
}

export interface ExportRoundTripWriterPdfResult {
  bytes: Uint8Array;
  elementCount: number;
  assetCount: number;
}

/**
 * Produce a single `.pdf` that:
 *  1. shows the overlay flattened into the page content (opens anywhere), and
 *  2. embeds the editable project source as a PDF file attachment so PDF Hub
 *     can restore the live, editable overlay on re-open.
 */
export async function exportRoundTripWriterPdf(
  input: ExportRoundTripWriterPdfInput,
): Promise<ExportRoundTripWriterPdfResult> {
  // 1. Flatten the overlay into a universally-viewable PDF appearance.
  const flattened = await exportFlattenedWriterPdf({
    pdfBytes: input.pdfBytes,
    elements: input.elements,
    assets: input.assets,
  });

  // 2. Serialize the editable project (original PDF + elements + assets).
  const project = await exportPdfHubWriterProject({
    originalPdfBytes: input.pdfBytes,
    documentFingerprint: input.documentFingerprint,
    elements: input.elements,
    assets: input.assets,
  });

  // 3. Attach the editable project inside the flattened PDF.
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.load(flattened.bytes);
  const now = new Date();
  await doc.attach(project.bytes, ROUND_TRIP_ATTACHMENT_NAME, {
    mimeType: 'application/zip',
    description: 'PDF Hub editable Writer overlay source',
    creationDate: now,
    modificationDate: now,
  });

  const bytes = await doc.save();

  return {
    bytes,
    elementCount: input.elements.length,
    assetCount: input.assets?.length ?? 0,
  };
}
