import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { bakeWriterElementsIntoPdf, type WriterExportWarning } from '@/core/writer/exporter';
import type { PdfAnnotation } from '@/core/annotations/types';
import type { PlacedElement } from '@/core/writer/types';
import { writeNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationWriter';

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
  writerExportWarnings: WriterExportWarning[];
}

/**
 * Creates a flattened PDF copy for explicit export/recovery workflows.
 *
 * This path intentionally burns application annotations into page content.
 * Normal Save must use composeEditablePdf() instead.
 */
export async function composeCommittedPdf(
  input: ComposeCommittedPdfInput,
): Promise<ComposeCommittedPdfResult> {
  const annotations = Array.isArray(input.annotations) ? input.annotations : [];
  const writerElements = Array.isArray(input.writerElements) ? input.writerElements : [];

  let nextBytes = new Uint8Array(input.baseBytes);
  const writerExportWarnings: WriterExportWarning[] = [];

  if (writerElements.length > 0) {
    const rawBytes = await bakeWriterElementsIntoPdf(nextBytes, writerElements, {
      preferSemantic: true,
      allowRasterFallback: true,
      collectWarnings: (warnings) => writerExportWarnings.push(...warnings),
    });
    nextBytes = new Uint8Array(rawBytes.buffer as ArrayBuffer, rawBytes.byteOffset, rawBytes.byteLength);
  }

  if (annotations.length > 0) {
    const rawBytes = await PdfEditAdapter.exportWithAnnotations(nextBytes, annotations);
    nextBytes = new Uint8Array(rawBytes.buffer as ArrayBuffer, rawBytes.byteOffset, rawBytes.byteLength);
  }

  const pageCount = await PdfEditAdapter.countPages(nextBytes);
  const documentKey = await FileAdapter.hashBytes(nextBytes);

  return {
    bytes: new Uint8Array(nextBytes.buffer as ArrayBuffer, nextBytes.byteOffset, nextBytes.byteLength),
    pageCount,
    documentKey,
    committedAnnotationCount: annotations.length,
    committedWriterElementCount: writerElements.length,
    hadAnnotations: annotations.length > 0,
    hadWriterElements: writerElements.length > 0,
    writerExportWarnings,
  };
}

/**
 * Creates the bytes for normal Save / Save As.
 *
 * Writer elements are committed as document content, while annotations are
 * serialized as editable native PDF /Annot objects.
 */
export async function composeEditablePdf(
  input: ComposeCommittedPdfInput,
): Promise<ComposeCommittedPdfResult> {
  const annotations = Array.isArray(input.annotations) ? input.annotations : [];
  const writerElements = Array.isArray(input.writerElements) ? input.writerElements : [];

  let nextBytes = new Uint8Array(input.baseBytes);
  const writerExportWarnings: WriterExportWarning[] = [];

  if (writerElements.length > 0) {
    const rawBytes = await bakeWriterElementsIntoPdf(nextBytes, writerElements, {
      preferSemantic: true,
      allowRasterFallback: true,
      collectWarnings: (warnings) => writerExportWarnings.push(...warnings),
    });
    nextBytes = new Uint8Array(
      rawBytes.buffer as ArrayBuffer,
      rawBytes.byteOffset,
      rawBytes.byteLength,
    );
  }

  if (annotations.length > 0) {
    const native = await writeNativePdfAnnotations(nextBytes, annotations);
    nextBytes = native.bytes;
  }

  const pageCount = await PdfEditAdapter.countPages(nextBytes);
  const documentKey = await FileAdapter.hashBytes(nextBytes);

  return {
    bytes: new Uint8Array(
      nextBytes.buffer as ArrayBuffer,
      nextBytes.byteOffset,
      nextBytes.byteLength,
    ),
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
