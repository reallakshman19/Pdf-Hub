/**
 * Non-destructive archival source composer.
 *
 * Builds an intermediate flattened PDF incorporating committed annotations,
 * legacy Writer elements, and Writer V2 overlay elements using subset-embedded
 * archival TTF fonts — while never mutating the active working session or
 * clearing editable annotations (`Docs/SAVE_SEMANTICS.md`).
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { composeCommittedPdf } from '@/core/document/commitPipeline';
import { getVerifiedNativeAuthorization } from '@/core/document/fileSaveWorkflow';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useCalloutStore } from '@/core/callout/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createBlankDocumentPdfBytes } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { flattenWriterElementsIntoDocument } from '@/core/writer-v2/export/flattenedPdfExport';
import type { PdfARemediationOptions } from './types';

export interface ArchivalSourceBuildResult {
  bytes: Uint8Array;
  fileName: string;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Failed to encode rasterized page canvas for PDF/A-1b flattening.');
  }
  const bin = globalThis.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Renders every page onto an opaque white RGB canvas and wraps into a clean
 * JPEG-based PDF so `PDF/A-1b` alpha transparency restrictions are eliminated
 * only when the user explicitly opts into page rasterization.
 */
async function rasterizePagesOpaqueForPdfA1b(sourceBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('Opaque PDF/A-1b page rasterization requires a browser canvas context.');
  }

  const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
  const lib = await pdfLib();

  const srcDoc = await lib.PDFDocument.load(sourceBytes, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  const lease = await PdfRendererAdapter.acquireDocument(sourceBytes);

  try {
    const outDoc = await lib.PDFDocument.create();
    const pageCount = lease.doc.numPages;

    for (let index = 0; index < pageCount; index += 1) {
      const pageNum = index + 1;
      const srcPage = srcDoc.getPage(index);
      const { width, height } = srcPage.getSize();
      const scale = 2.0; // 144 DPI crisp archival raster fallback

      const pdfJsPage = await lease.doc.getPage(pageNum);
      const viewport = pdfJsPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Unable to acquire 2D canvas context for opaque PDF/A-1b rasterization.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await PdfRendererAdapter.renderPage(pdfJsPage, canvas, viewport).completed;
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const jpegBytes = dataUrlToBytes(jpegDataUrl);
      const embeddedJpg = await outDoc.embedJpg(jpegBytes);
      const outPage = outDoc.addPage([width, height]);
      outPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    return outDoc.save({ useObjectStreams: false });
  } finally {
    await lease.release();
  }
}

/**
 * Prepares the current open PDF + overlays into an archival-ready intermediate
 * PDF buffer without altering live session stores.
 */
export async function composeArchivalSourcePdf(
  options: Pick<
    PdfARemediationOptions,
    'targetConformance' | 'flattenAnnotations' | 'rasterizeTransparentPagesFor1b'
  >,
): Promise<ArchivalSourceBuildResult> {
  const session = useSessionStore.getState();
  const writerV2 = useWriterV2Store.getState();
  const annotationsState = useAnnotationStore.getState();
  const legacyWriter = useCalloutStore.getState();

  let workingBytes: Uint8Array | null = session.workingBytes
    ? new Uint8Array(session.workingBytes)
    : null;

  if (!workingBytes && writerV2.documentMeta?.mode === 'blankDocument') {
    workingBytes = await createBlankDocumentPdfBytes(writerV2.documentMeta);
  }

  if (!workingBytes) {
    throw new Error('No working PDF is loaded for archival export.');
  }

  if (options.flattenAnnotations && session.workingBytes && session.documentKey) {
    const canAuthorizeNative =
      annotationsState.hydratedDocumentKey === session.documentKey &&
      annotationsState.nativeIntegrity.documentKey === session.documentKey &&
      annotationsState.nativeIntegrity.status === 'COMPLETE';

    if (canAuthorizeNative) {
      const auth = await getVerifiedNativeAuthorization();
      const committed = await composeCommittedPdf({
        baseBytes: workingBytes,
        annotations: annotationsState.annotations,
        writerElements: legacyWriter.elements,
        replaceManagedAnnotations: true,
        nativeDeletionAuthorization: auth,
      });
      workingBytes = new Uint8Array(committed.bytes);
    }
  }

  const visibleV2 = writerV2.elements.filter((el) => !el.hidden);
  if (visibleV2.length > 0) {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.load(workingBytes, {
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    await flattenWriterElementsIntoDocument(doc, {
      elements: visibleV2,
      assets: writerV2.assetRecords,
      archivalFontMode: true,
    });
    workingBytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
  }

  if (
    options.targetConformance === 'PDFA_1B' &&
    options.rasterizeTransparentPagesFor1b
  ) {
    workingBytes = await rasterizePagesOpaqueForPdfA1b(workingBytes);
  }

  return {
    bytes: workingBytes,
    fileName: session.fileName || 'document.pdf',
  };
}
