import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { flattenWriterElementsIntoDocument } from './flattenedPdfExport';
import {
  captureIncrementalPdfBaseline,
  serializeIncrementalPdfUpdate,
} from '@/core/pdf/incrementalPdfUpdate';
import { exportPdfHubWriterProject } from './projectZip';
import type { WriterDocumentMetaV2, WriterElementV2 } from '../types';
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
  documentMeta?: WriterDocumentMetaV2 | null;
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
 *
 * The overlay and attachment are written as an incremental update: the
 * source PDF bytes stay an exact prefix of the output, and the embedded
 * project references that prefix instead of storing a second copy of the
 * original. File size therefore grows only by the overlay and project data.
 * Sources that cannot be appended to (e.g. encrypted) fall back to a full
 * rewrite with the original packaged inside the project.
 */
export async function exportRoundTripWriterPdf(
  input: ExportRoundTripWriterPdfInput,
): Promise<ExportRoundTripWriterPdfResult> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(input.pdfBytes, { updateMetadata: false });
  const baseline = captureIncrementalPdfBaseline(doc, lib, input.pdfBytes);

  // 1. Flatten the overlay into a universally-viewable PDF appearance.
  await flattenWriterElementsIntoDocument(doc, {
    elements: input.elements,
    assets: input.assets,
  });

  // 2. Serialize the editable project (elements + assets, and the original
  //    PDF only when it cannot be recovered from the output prefix).
  const project = await exportPdfHubWriterProject({
    originalPdfBytes: input.pdfBytes,
    originalPdfPlacement: baseline ? 'host-pdf-prefix' : 'member',
    documentFingerprint: input.documentFingerprint,
    documentMeta: input.documentMeta,
    elements: input.elements,
    assets: input.assets,
  });

  // 3. Attach the editable project inside the flattened PDF.
  const now = new Date();
  await doc.attach(project.bytes, ROUND_TRIP_ATTACHMENT_NAME, {
    mimeType: 'application/zip',
    description: 'PDF Hub editable Writer overlay source',
    creationDate: now,
    modificationDate: now,
  });

  const bytes = baseline
    ? (await serializeIncrementalPdfUpdate(doc, lib, baseline)).bytes
    : await doc.save();

  return {
    bytes,
    elementCount: input.elements.length,
    assetCount: input.assets?.length ?? 0,
  };
}
