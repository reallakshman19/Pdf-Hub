import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocumentSource } from '@/core/document-source/types';
import { PdfRendererAdapter } from './PdfRendererAdapter';
import * as pdfjsLib from 'pdfjs-dist';

vi.mock('pdfjs-dist', () => ({
  AnnotationMode: { DISABLE: 0 },
  GlobalWorkerOptions: { workerSrc: '' },
  Util: { transform: vi.fn() },
  PDFDataRangeTransport: class {
    constructor(
      readonly length: number,
      readonly initialData: Uint8Array | null,
    ) {}

    onDataRange(
      _begin: number,
      _chunk: Uint8Array,
    ): void {}

    requestDataRange(
      _begin: number,
      _end: number,
    ): void {}

    abort(): void {}
  },
  getDocument: vi.fn(),
}));

function mockDocument(id: string): PDFDocumentProxy {
  return {
    numPages: 2,
    destroy: vi.fn().mockResolvedValue(undefined),
    fingerprint: id,
  } as unknown as PDFDocumentProxy;
}

function mockSource(bytes: Uint8Array): DocumentSource & {
  size: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    id: 'revision:test',
    kind: 'opfs',
    capabilities: {
      randomAccess: true,
      immutableReads: true,
      persistent: true,
    },
    size: vi.fn().mockResolvedValue(bytes.byteLength),
    read: vi.fn(async (offset: number, length: number) =>
      bytes.slice(offset, offset + length)),
  };
}

function loadingTask(doc: PDFDocumentProxy) {
  return {
    promise: Promise.resolve(doc),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as ReturnType<typeof pdfjsLib.getDocument>;
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

  it('loads a DocumentSource through PDF.js range transport without whole-source reads', async () => {
    const doc = mockDocument('source-one');
    const source = mockSource(
      Uint8Array.from([1, 2, 3, 4, 5, 6]),
    );
    vi.mocked(pdfjsLib.getDocument).mockReturnValue(
      loadingTask(doc),
    );

    const lease = await PdfRendererAdapter.acquireDocumentSource({
      source,
      cacheKey: 'sha256:source-one',
    });

    expect(source.size).toHaveBeenCalledTimes(1);
    expect(source.read).not.toHaveBeenCalled();
    expect(lease.doc).toBe(doc);
    expect(lease.cacheKey).toBe('sha256:source-one');

    const parameters = vi.mocked(pdfjsLib.getDocument)
      .mock.calls[0]?.[0] as Record<string, unknown>;
    expect(parameters).toMatchObject({
      rangeChunkSize: 64 * 1024,
      disableRange: false,
      disableStream: true,
      disableAutoFetch: true,
    });
    expect(parameters).toHaveProperty('range');
    expect(parameters).not.toHaveProperty('data');

    expect(
      PdfRendererAdapter.getDocumentSourceCacheDiagnostics(),
    ).toEqual([
      expect.objectContaining({
        cacheKey: 'sha256:source-one',
        sourceId: 'revision:test',
        sourceKind: 'opfs',
        sourceSize: 6,
        activeLeases: 1,
        loaded: true,
        rangeRequests: 0,
        rangeBytesDelivered: 0,
      }),
    ]);

    await lease.release();
  });

  it('reuses one source-backed PDF.js document for the same revision key', async () => {
    const doc = mockDocument('source-reuse');
    const source = mockSource(new Uint8Array(8));
    vi.mocked(pdfjsLib.getDocument).mockReturnValue(
      loadingTask(doc),
    );

    const first = await PdfRendererAdapter.acquireDocumentSource({
      source,
      cacheKey: 'sha256:reuse',
    });
    const second = await PdfRendererAdapter.acquireDocumentSource({
      source,
      cacheKey: 'sha256:reuse',
    });

    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
    expect(source.size).toHaveBeenCalledTimes(1);
    expect(first.doc).toBe(doc);
    expect(second.doc).toBe(doc);
    expect(
      PdfRendererAdapter.getDocumentCacheDiagnostics(),
    ).toMatchObject({
      entries: 1,
      activeLeases: 2,
    });

    await first.release();
    await second.release();
  });

  it('keeps source-backed cache entries isolated from byte-backed admission entries', async () => {
    const byteDoc = mockDocument('byte');
    const sourceDoc = mockDocument('source');
    vi.mocked(pdfjsLib.getDocument)
      .mockReturnValueOnce(loadingTask(byteDoc))
      .mockReturnValueOnce(loadingTask(sourceDoc));

    const bytes = Uint8Array.from([9, 8, 7, 6]);
    const byteLease =
      await PdfRendererAdapter.acquireDocument(bytes);
    await byteLease.release();

    const source = mockSource(bytes);
    const sourceLease =
      await PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: byteLease.cacheKey,
      });

    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(2);
    expect(sourceLease.doc).toBe(sourceDoc);
    expect(sourceLease.cacheKey).toBe(byteLease.cacheKey);
    expect(
      PdfRendererAdapter.getDocumentCacheDiagnostics(),
    ).toMatchObject({
      entries: 2,
      activeLeases: 1,
      idleEntries: 1,
    });

    await sourceLease.release();
  });

  it('removes a failed source load so the revision can retry', async () => {
    const source = mockSource(new Uint8Array(4));
    const retryDoc = mockDocument('source-retry');
    vi.mocked(pdfjsLib.getDocument)
      .mockReturnValueOnce({
        promise: Promise.reject(
          new Error('source parse failed'),
        ),
        destroy: vi.fn().mockResolvedValue(undefined),
      } as ReturnType<typeof pdfjsLib.getDocument>)
      .mockReturnValueOnce(loadingTask(retryDoc));

    await expect(
      PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: 'sha256:source-retry',
      }),
    ).rejects.toThrow('source parse failed');

    const retry =
      await PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: 'sha256:source-retry',
      });

    expect(retry.doc).toBe(retryDoc);
    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(2);
    await retry.release();
  });

  it('force-clears a source-backed entry by aborting its transport and destroying its document', async () => {
    const doc = mockDocument('source-clear');
    const source = mockSource(new Uint8Array(16));
    vi.mocked(pdfjsLib.getDocument).mockReturnValue(
      loadingTask(doc),
    );

    const lease =
      await PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: 'sha256:source-clear',
      });

    const parameters = vi.mocked(pdfjsLib.getDocument)
      .mock.calls[0]?.[0] as {
        range?: { abort: () => void };
      };
    expect(parameters.range).toBeDefined();
    const abort = vi.spyOn(parameters.range!, 'abort');

    await PdfRendererAdapter.clearDocumentCache({
      force: true,
    });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
    expect(
      PdfRendererAdapter.getDocumentCacheDiagnostics(),
    ).toMatchObject({
      entries: 0,
      activeLeases: 0,
    });

    await lease.release();
  });

  it('does not destroy a shared source load when only one waiting acquisition is cancelled', async () => {
    const doc = mockDocument('source-shared');
    const source = mockSource(new Uint8Array(16));
    let resolveLoad!: (value: PDFDocumentProxy) => void;
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: new Promise<PDFDocumentProxy>((resolve) => {
        resolveLoad = resolve;
      }),
      destroy,
    } as ReturnType<typeof pdfjsLib.getDocument>);

    const controller = new AbortController();
    const cancelled =
      PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: 'sha256:source-shared',
        signal: controller.signal,
      });
    const surviving =
      PdfRendererAdapter.acquireDocumentSource({
        source,
        cacheKey: 'sha256:source-shared',
      });

    await Promise.resolve();
    controller.abort('cancel only first waiter');

    await expect(cancelled).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });

    resolveLoad(doc);
    const lease = await surviving;

    expect(lease.doc).toBe(doc);
    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(
      PdfRendererAdapter.getDocumentCacheDiagnostics(),
    ).toMatchObject({
      entries: 1,
      activeLeases: 1,
    });

    await lease.release();
  });

  it('extracts text-layer items from an already-loaded PDF page', async () => {
    vi.mocked(pdfjsLib.Util.transform).mockReturnValue([
      1,
      0,
      0,
      12,
      24,
      36,
    ]);

    const page = {
      pageNumber: 2,
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, -1, 0, 100],
      }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [{
          str: 'Hello',
          transform: [1, 0, 0, 12, 24, 36],
          width: 5,
        }],
      }),
    } as unknown as PDFPageProxy;

    const items =
      await PdfRendererAdapter.getPageTextItems(
        page,
        1,
      );

    expect(
      pdfjsLib.Util.transform,
    ).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'page-2-text-0',
      text: 'Hello',
      x: 24,
      y: 24,
      width: 5,
      fontSize: 12,
    });
    expect(items[0]?.height).toBeGreaterThan(12);
  });

  it('preserves scale-independent PDF.js source text metadata for existing-text inspection', async () => {
    const page = {
      pageNumber: 3,
      getTextContent:
        vi.fn().mockResolvedValue({
          items: [
            {
              str: 'Editable',
              transform: [
                12,
                0,
                0,
                12,
                72,
                700,
              ],
              width: 48,
              height: 12,
              fontName:
                'g_d0_f1',
              dir: 'ltr',
              hasEOL: true,
            },
            {
              str: 'Malformed',
              transform: [
                'bad',
                0,
                0,
                12,
                72,
                680,
              ],
              width: undefined,
              height: undefined,
            },
          ],
        }),
    } as unknown as PDFPageProxy;

    const items =
      await PdfRendererAdapter
        .getPageExistingTextSourceItems(
          page,
        );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      sourceIndex: 0,
      text: 'Editable',
      transform: [
        12,
        0,
        0,
        12,
        72,
        700,
      ],
      width: 48,
      height: 12,
      fontName: 'g_d0_f1',
      direction: 'ltr',
      hasEol: true,
    });
    expect(items[1])
      .toMatchObject({
        sourceIndex: 1,
        text: 'Malformed',
        width: Number.NaN,
        height: Number.NaN,
        hasEol: false,
      });
    expect(
      Number.isNaN(
        items[1]?.transform[0],
      ),
    ).toBe(true);
  });

  it('flattens loaded-document outline destinations without reacquiring the PDF', async () => {
    const destinationRef = {
      num: 10,
      gen: 0,
    };
    const getPageIndex =
      vi.fn().mockResolvedValue(2);
    const doc = {
      getOutline: vi.fn().mockResolvedValue([
        {
          title: 'Chapter 1',
          dest: [destinationRef],
          items: [{
            title: 'Child',
            dest: null,
            items: [],
          }],
        },
      ]),
      getPageIndex,
      getDestination: vi.fn(),
    } as unknown as PDFDocumentProxy;

    const outline =
      await PdfRendererAdapter.getOutlineFlat(doc);

    expect(getPageIndex).toHaveBeenCalledWith(
      destinationRef,
    );
    expect(outline).toEqual([
      {
        id: 'outline-0',
        title: 'Chapter 1',
        pageNumber: 3,
        depth: 0,
      },
      {
        id: 'outline-1',
        title: 'Child',
        pageNumber: null,
        depth: 1,
      },
    ]);
  });

  it('cancels an active PDF.js render task when its signal aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const page = {
      pageNumber: 3,
      render: vi.fn(() => ({
        promise: new Promise<void>(() => undefined),
        cancel,
      })),
    } as unknown as PDFPageProxy;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({})),
    } as unknown as HTMLCanvasElement;
    const viewport = { width: 100, height: 200 } as PageViewport;

    const token = PdfRendererAdapter.renderPage(page, canvas, viewport, {
      signal: controller.signal,
    });
    controller.abort('test cancellation');

    await expect(token.completed).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('removes a failed load so a later acquisition can retry', async () => {
    const doc = mockDocument('retry');
    vi.mocked(pdfjsLib.getDocument)
      .mockImplementationOnce(() => ({
        promise: Promise.resolve().then(() => {
          throw new Error('malformed PDF');
        }),
      } as ReturnType<typeof pdfjsLib.getDocument>))
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
