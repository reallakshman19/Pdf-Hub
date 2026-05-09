// @ts-nocheck
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { flattenWriterElementsToPdf, type WriterExportPlan } from '@/core/writer/exporter';
import type { PdfAnnotation } from '@/core/annotations/types';
import type { PlacedElement } from '@/core/writer/types';

export interface ComposeCommittedPdfInput {
  baseBytes: Uint8Array;
  annotations: PdfAnnotation[];
  writerElements: PlacedElement[];
}

export interface ComposeCommittedPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  documentKey: string;
  committedAnnotationCount: number;
  committedWriterElementCount: number;
  hadAnnotations: boolean;
  hadWriterElements: boolean;
  writerExportWarnings: WriterExportPlan[];
}

/**
 * Creates the exact PDF bytes that should be written to disk for Save/Export.
 *
 * Contract:
 * 1. Start from current working PDF bytes.
 * 2. Bake writer/page-builder elements first.
 * 3. Flatten annotations second so review markup remains visually above writer content.
 * 4. Recount pages from final bytes.
 * 5. Hash final bytes for the next durable documentKey.
 *
 * This function is intentionally pure from app-state perspective:
 * it does not mutate session store, annotation store, writer store, file handles,
 * dirty flags, or UI state.
 */
export async function composeCommittedPdf(
  input: ComposeCommittedPdfInput,
): Promise<ComposeCommittedPdfResult> {
  const annotations = Array.isArray(input.annotations) ? input.annotations : [];
  const writerElements = Array.isArray(input.writerElements) ? input.writerElements : [];

  let nextBytes = new Uint8Array(input.baseBytes);
  const writerExportWarnings: WriterExportPlan[] = [];

  if (writerElements.length > 0) {
    nextBytes = await flattenWriterElementsToPdf(nextBytes, writerElements, {
      preferSemantic: true,
      allowRasterFallback: true,
      collectWarnings: (warnings) => writerExportWarnings.push(...warnings),
    });
  }

  if (annotations.length > 0) {
    nextBytes = await PdfEditAdapter.exportWithAnnotations(nextBytes, annotations);
  }

  const pageCount = await PdfEditAdapter.countPages(nextBytes);
  const documentKey = await FileAdapter.hashBytes(nextBytes);

  return {
    bytes: new Uint8Array(nextBytes),
    pageCount,
    documentKey,
    committedAnnotationCount: annotations.length,
    committedWriterElementCount: writerElements.length,
    hadAnnotations: annotations.length > 0,
    hadWriterElements: writerElements.length > 0,
    writerExportWarnings,
  };
}

export async function makeCommittedDocumentKey(bytes: Uint8Array): Promise<string> {
  return FileAdapter.hashBytes(bytes);
}
