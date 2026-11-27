import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useCalloutStore } from '@/core/callout/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  dispatchDefaultPrintIframe,
  printCurrentDocument,
  resolveDefaultPrintablePdfBytes,
  type PrintablePageImage,
} from './printPdfWorkflow';

async function createSamplePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Print Page ${i + 1}`, { x: 24, y: 340, size: 14 });
  }
  return doc.save();
}

describe('printPdfWorkflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().clearDocument();
    useAnnotationStore.setState({
      annotations: [],
      nativeDeletionTombstones: [],
      hydratedDocumentKey: null,
      nativeIntegrity: {
        documentKey: null,
        status: 'LOADING',
      },
    });
    useCalloutStore.setState({ elements: [] });
    useWriterV2Store.setState({
      documentMeta: null,
      elements: [],
      currentDocumentFingerprint: null,
    });
    document.querySelectorAll('iframe[data-pdf-hub-print-frame="true"]').forEach((el) => el.remove());
  });

  it('shows an info toast and returns false when no document is open', async () => {
    const addToast = vi.fn();
    const ok = await printCurrentDocument(addToast);
    expect(ok).toBe(false);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: 'No Document Open',
    }));
  });

  it('resolves workingBytes directly for an unannotated open PDF', async () => {
    const bytes = await createSamplePdf(2);
    useSessionStore.setState({
      workingBytes: bytes,
      fileName: 'sample.pdf',
      documentKey: 'doc-1',
    });

    const resolved = await resolveDefaultPrintablePdfBytes();
    expect(resolved).not.toBeNull();
    expect(resolved?.fileName).toBe('sample.pdf');
    expect(resolved?.bytes).toBe(bytes);
  });

  it('dispatches print pages into a hidden iframe and cleans up on afterprint', async () => {
    const revoke = vi.fn();
    const pages: PrintablePageImage[] = [
      { pageNumber: 1, width: 300, height: 400, src: 'data:image/png;base64,AA==', revoke },
      { pageNumber: 2, width: 300, height: 400, src: 'data:image/png;base64,AA==', revoke },
    ];

    const originalCreateElement = document.createElement.bind(document);
    const fakeFrameDoc = document.implementation.createHTMLDocument('');
    const origFakeCreate = fakeFrameDoc.createElement.bind(fakeFrameDoc);
    vi.spyOn(fakeFrameDoc, 'createElement').mockImplementation(((tagName: string) => {
      const node = origFakeCreate(tagName);
      if (tagName.toLowerCase() === 'img') {
        Object.defineProperty(node, 'decode', { value: () => Promise.resolve() });
      }
      return node;
    }) as typeof fakeFrameDoc.createElement);
    const afterPrintHandlers: Array<() => void> = [];
    const printMock = vi.fn();
    const focusMock = vi.fn();
    const fakeFrameWin = {
      focus: focusMock,
      print: printMock,
      addEventListener: (event: string, cb: () => void) => {
        if (event === 'afterprint') afterPrintHandlers.push(cb);
      },
    } as unknown as Window;

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'iframe') {
        Object.defineProperty(el, 'contentDocument', { get: () => fakeFrameDoc });
        Object.defineProperty(el, 'contentWindow', { get: () => fakeFrameWin });
      }
      return el;
    }) as typeof document.createElement);

    await dispatchDefaultPrintIframe(pages, 'report.pdf');

    expect(focusMock).toHaveBeenCalledTimes(1);
    expect(printMock).toHaveBeenCalledTimes(1);
    expect(fakeFrameDoc.title).toBe('report.pdf');
    expect(fakeFrameDoc.querySelectorAll('img.pdf-hub-print-page')).toHaveLength(2);
    expect(afterPrintHandlers).toHaveLength(1);

    afterPrintHandlers[0]!();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(document.querySelector('iframe[data-pdf-hub-print-frame="true"]')).toBeNull();
  });

  it('logs and notifies user if page rendering fails during print', async () => {
    const bytes = await createSamplePdf(1);
    useSessionStore.setState({
      workingBytes: bytes,
      fileName: 'broken.pdf',
      documentKey: 'doc-broken',
    });
    const addToast = vi.fn();

    const ok = await printCurrentDocument(addToast, {
      renderPagesForPrint: async () => {
        throw new Error('Simulated render boom');
      },
    });

    expect(ok).toBe(false);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: 'Print Failed',
      message: 'Simulated render boom',
    }));
  });
});
