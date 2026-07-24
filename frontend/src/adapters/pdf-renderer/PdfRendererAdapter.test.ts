import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRendererAdapter } from './PdfRendererAdapter';
import * as pdfjsLib from 'pdfjs-dist';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  Util: { transform: vi.fn() },
  getDocument: vi.fn(),
}));

function mockDocument(id: string): PDFDocumentProxy {
  return {
    numPages: 2,
    destroy: vi.fn().mockResolvedValue(undefined),
    fingerprint: id,
  } as unknown as PDFDocumentProxy;
}

describe('PdfRendererAdapter document lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await PdfRendererAdapter.clearDocumentCache({ force: true });
  });

  afterEach(async () => {
    await PdfRendererAdapter.clearDocumentCache({ force: true });
  });

  it('deduplicates equal PDF content across different byte objects', async () => {
    const doc = mockDocument('one');
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(doc),
    } as ReturnType<typeof pdfjsLib.getDocument>);

    const first = await PdfRendererAdapter.acquireDocument(new Uint8Array([1, 2, 3]));
    const second = await PdfRendererAdapter.acquireDocument(new Uint8Array([1, 2, 3]));

    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
    expect(first.doc).toBe(doc);
    expect(second.doc).toBe(doc);
    expect(PdfRendererAdapter.getDocumentCacheDiagnostics()).toEqual({
      entries: 1,
      activeLeases: 2,
      idleEntries: 0,
      maxEntries: 2,
    });

    await first.release();
    await second.release();
    expect(PdfRendererAdapter.getDocumentCacheDiagnostics().activeLeases).toBe(0);
  });

  it('makes release idempotent', async () => {
    const doc = mockDocument('one');
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(doc),
    } as ReturnType<typeof pdfjsLib.getDocument>);

    const lease = await PdfRendererAdapter.acquireDocument(new Uint8Array([4]));
    await lease.release();
    await lease.release();

    expect(PdfRendererAdapter.getDocumentCacheDiagnostics().activeLeases).toBe(0);
  });

  it('destroys the least-recently-used idle document when the cache exceeds two entries', async () => {
    const docs = [mockDocument('one'), mockDocument('two'), mockDocument('three')];
    vi.mocked(pdfjsLib.getDocument)
      .mockReturnValueOnce({ promise: Promise.resolve(docs[0]) } as ReturnType<typeof pdfjsLib.getDocument>)
      .mockReturnValueOnce({ promise: Promise.resolve(docs[1]) } as ReturnType<typeof pdfjsLib.getDocument>)
      .mockReturnValueOnce({ promise: Promise.resolve(docs[2]) } as ReturnType<typeof pdfjsLib.getDocument>);

    const first = await PdfRendererAdapter.acquireDocument(new Uint8Array([1]));
    await first.release();
    const second = await PdfRendererAdapter.acquireDocument(new Uint8Array([2]));
    await second.release();
    const third = await PdfRendererAdapter.acquireDocument(new Uint8Array([3]));

    expect(docs[0].destroy).toHaveBeenCalledTimes(1);
    expect(docs[1].destroy).not.toHaveBeenCalled();
    expect(docs[2].destroy).not.toHaveBeenCalled();
    expect(PdfRendererAdapter.getDocumentCacheDiagnostics()).toMatchObject({
      entries: 2,
      activeLeases: 1,
      idleEntries: 1,
    });

    await third.release();
  });

  it('removes a failed load so a later acquisition can retry', async () => {
    const doc = mockDocument('retry');
    vi.mocked(pdfjsLib.getDocument)
      .mockReturnValueOnce({
        promise: Promise.resolve().then(() => {
          throw new Error('malformed PDF');
        }),
      } as ReturnType<typeof pdfjsLib.getDocument>)
      .mockReturnValueOnce({
        promise: Promise.resolve(doc),
      } as ReturnType<typeof pdfjsLib.getDocument>);

    await expect(
      PdfRendererAdapter.acquireDocument(new Uint8Array([9])),
    ).rejects.toThrow('malformed PDF');

    const retry = await PdfRendererAdapter.acquireDocument(new Uint8Array([9]));
    expect(retry.doc).toBe(doc);
    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(2);
    await retry.release();
  });
});
