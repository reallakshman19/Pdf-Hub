import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { useAnnotationStore } from '@/core/annotations/store';
import { buildCurrentFlattenedPdf } from '@/core/document/fileSaveWorkflow';
import { error as logError, info } from '@/core/logger/service';
import { useAcroFormStore } from '@/core/pdf-forms/store';
import { useSessionStore } from '@/core/session/store';
import type { Toast } from '@/core/toast/store';
import { useCalloutStore } from '@/core/callout/store';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export type AddPrintToastFn = (toast: Omit<Toast, 'id'>) => void;

export interface PrintablePageImage {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly src: string;
  readonly revoke: () => void;
}

export interface PrintWorkflowDeps {
  resolvePrintablePdfBytes?: () => Promise<{ bytes: Uint8Array; fileName: string } | null>;
  renderPagesForPrint?: (bytes: Uint8Array, signal?: AbortSignal) => Promise<PrintablePageImage[]>;
  dispatchPrintDocument?: (pages: PrintablePageImage[], documentTitle: string) => Promise<void>;
}

const MAX_PRINT_CANVAS_DIMENSION_PX = 2400;
const PRINT_IFRAME_CLEANUP_TIMEOUT_MS = 60_000;

function computePrintScale(widthPt: number, heightPt: number): number {
  const maxDim = Math.max(widthPt, heightPt);
  if (maxDim <= 0) return 2;
  return Math.max(0.5, Math.min(2, MAX_PRINT_CANVAS_DIMENSION_PX / maxDim));
}

function canvasToPrintableUrl(canvas: HTMLCanvasElement): Promise<{ src: string; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob && typeof URL.createObjectURL === 'function') {
          const objectUrl = URL.createObjectURL(blob);
          resolve({
            src: objectUrl,
            revoke: () => {
              try {
                URL.revokeObjectURL(objectUrl);
              } catch {
                // Ignore revoke errors during teardown.
              }
            },
          });
          return;
        }
        try {
          resolve({
            src: canvas.toDataURL('image/png'),
            revoke: () => {},
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 'image/png');
      return;
    }

    try {
      resolve({
        src: canvas.toDataURL('image/png'),
        revoke: () => {},
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function resolveDefaultPrintablePdfBytes(): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const writerV2 = useWriterV2Store.getState();
  if (writerV2.documentMeta?.mode === 'blankDocument') {
    const bytes = await exportCurrentWriterPdf({});
    const baseTitle = writerV2.documentMeta.title?.trim() || 'Untitled Document';
    return {
      bytes,
      fileName: baseTitle.toLowerCase().endsWith('.pdf') ? baseTitle : `${baseTitle}.pdf`,
    };
  }

  const session = useSessionStore.getState();
  if (!session.workingBytes) {
    return null;
  }

  const annotationState = useAnnotationStore.getState();
  const writerElements = useCalloutStore.getState().elements;
  const acroFormState = useAcroFormStore.getState();
  const hasDirtyForm =
    acroFormState.documentKey === session.documentKey
    && acroFormState.dirtyFieldNames.length > 0;
  const hasOverlayEdits =
    annotationState.annotations.length > 0
    || annotationState.nativeDeletionTombstones.length > 0
    || writerElements.length > 0
    || hasDirtyForm;
  const canComposeFlattened =
    !session.isEncryptedSource
    && hasOverlayEdits
    && Boolean(session.documentKey)
    && annotationState.hydratedDocumentKey === session.documentKey
    && annotationState.nativeIntegrity.documentKey === session.documentKey
    && annotationState.nativeIntegrity.status === 'COMPLETE';

  if (canComposeFlattened) {
    const { bytes } = await buildCurrentFlattenedPdf();
    return {
      bytes,
      fileName: session.fileName || 'document.pdf',
    };
  }

  return {
    bytes: session.workingBytes,
    fileName: session.fileName || 'document.pdf',
  };
}

export async function renderDefaultPagesForPrint(
  pdfBytes: Uint8Array,
  signal?: AbortSignal,
): Promise<PrintablePageImage[]> {
  const lease = await PdfRendererAdapter.acquireDocument(pdfBytes);
  const rendered: PrintablePageImage[] = [];

  try {
    const pageCount = lease.doc.numPages;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await lease.doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = computePrintScale(baseViewport.width, baseViewport.height);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const token = PdfRendererAdapter.renderPage(page, canvas, viewport, { signal });
      await token.completed;

      const { src, revoke } = await canvasToPrintableUrl(canvas);
      rendered.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        src,
        revoke,
      });

      // Shrink canvas backing store immediately after encoding each page.
      canvas.width = 0;
      canvas.height = 0;
    }
    return rendered;
  } catch (err) {
    for (const item of rendered) {
      item.revoke();
    }
    throw err;
  } finally {
    await lease.release();
  }
}

function waitForImageReady(img: HTMLImageElement, timeoutMs = 4000): Promise<void> {
  if (typeof img.decode === 'function') {
    return Promise.race([
      img.decode().catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
  }
  if (img.complete) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}

export async function dispatchDefaultPrintIframe(
  pages: PrintablePageImage[],
  documentTitle: string,
): Promise<void> {
  if (pages.length === 0) {
    throw new Error('Document has no printable pages.');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-pdf-hub-print-frame', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  let cleanedUp = false;
  let fallbackTimer: number | null = null;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    for (const page of pages) {
      page.revoke();
    }
    iframe.remove();
  };

  try {
    const frameDoc = iframe.contentDocument;
    const frameWin = iframe.contentWindow;
    if (!frameDoc || !frameWin) {
      throw new Error('Unable to initialize print frame.');
    }

    frameDoc.open();
    frameDoc.write('<!doctype html><html><head><title></title></head><body></body></html>');
    frameDoc.close();
    frameDoc.title = documentTitle;

    const styleEl = frameDoc.createElement('style');
    styleEl.textContent = [
      '@page { margin: 0; size: auto; }',
      'html, body { margin: 0; padding: 0; background: #ffffff; }',
      'img.pdf-hub-print-page {',
      '  display: block;',
      '  width: 100vw;',
      '  height: 100vh;',
      '  object-fit: contain;',
      '  page-break-after: always;',
      '  break-after: page;',
      '}',
      'img.pdf-hub-print-page:last-child {',
      '  page-break-after: auto;',
      '  break-after: auto;',
      '}',
    ].join('\n');
    frameDoc.head.appendChild(styleEl);

    const images: HTMLImageElement[] = [];
    for (const page of pages) {
      const img = frameDoc.createElement('img');
      img.className = 'pdf-hub-print-page';
      img.alt = `Page ${page.pageNumber}`;
      img.src = page.src;
      frameDoc.body.appendChild(img);
      images.push(img);
    }

    await Promise.all(images.map((img) => waitForImageReady(img)));

    frameWin.addEventListener('afterprint', cleanup, { once: true });
    fallbackTimer = window.setTimeout(cleanup, PRINT_IFRAME_CLEANUP_TIMEOUT_MS);

    frameWin.focus();
    frameWin.print();
  } catch (err) {
    cleanup();
    throw err;
  }
}

export async function printCurrentDocument(
  addToast: AddPrintToastFn,
  deps: PrintWorkflowDeps = {},
): Promise<boolean> {
  const resolveBytes = deps.resolvePrintablePdfBytes ?? resolveDefaultPrintablePdfBytes;
  const renderPages = deps.renderPagesForPrint ?? renderDefaultPagesForPrint;
  const dispatchPrint = deps.dispatchPrintDocument ?? dispatchDefaultPrintIframe;

  const target = await resolveBytes();
  if (!target) {
    addToast({
      type: 'info',
      title: 'No Document Open',
      message: 'Open a PDF or start a blank document before printing.',
    });
    return false;
  }

  try {
    info('session', 'Preparing PDF pages for printing', {
      fileName: target.fileName,
      byteLength: target.bytes.byteLength,
    });
    const pages = await renderPages(target.bytes);
    await dispatchPrint(pages, target.fileName);
    info('session', 'Print dialog dispatched', {
      fileName: target.fileName,
      pageCount: pages.length,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('session', 'Failed to print document', {
      fileName: target.fileName,
      error: message,
    });
    addToast({
      type: 'error',
      title: 'Print Failed',
      message: message || 'Unable to prepare this document for printing.',
    });
    return false;
  }
}
