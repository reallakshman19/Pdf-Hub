import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PdfRendererAdapter } from './PdfRendererAdapter';

function makeMockPage(overrides: Partial<Record<string, unknown>> = {}): PDFPageProxy {
  const renderCancel = vi.fn();
  let resolveRender!: () => void;
  const renderPromise = new Promise<void>((res) => {
    resolveRender = res;
  });

  return {
    pageNumber: 1,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    })),
    getTextContent: vi.fn(async () => ({
      items: [
        { str: 'Pump', transform: [12, 0, 0, 12, 40, 700], width: 32, height: 12 },
        { str: 'Discharge Line', transform: [12, 0, 0, 12, 100, 700], width: 80, height: 12 },
        { invalid: true },
      ],
    })),
    render: vi.fn(() => {
      queueMicrotask(() => resolveRender());
      return { promise: renderPromise, cancel: renderCancel };
    }),
    cleanup: vi.fn(),
    ...overrides,
  } as unknown as PDFPageProxy;
}

describe('PdfRendererAdapter page, text, search, and outline helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page onto canvas and supports token cancellation', async () => {
    const canvas = document.createElement('canvas');
    const fakeCtx = {} as CanvasRenderingContext2D;
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx);
    const page = makeMockPage({ getOptionalContentConfig: vi.fn(async () => ({})) });
    const viewport = page.getViewport({ scale: 1.5 }) as PageViewport;

    const token = PdfRendererAdapter.renderPage(page, canvas, viewport);
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(1200);
    await token.completed;
    await token.cancel();

    const noCtxCanvas = document.createElement('canvas');
    vi.spyOn(noCtxCanvas, 'getContext').mockReturnValue(null);
    expect(() => PdfRendererAdapter.renderPage(page, noCtxCanvas, viewport)).toThrow('Could not get 2d context');
  });

  it('extracts page dimensions, text items, source items, plain text, and searches documents', async () => {
    const page = makeMockPage();
    expect(PdfRendererAdapter.getPageDimensions(page)).toEqual({ width: 600, height: 800 });

    const items = await PdfRendererAdapter.getPageTextItems(page, 1);
    expect(items).toHaveLength(2);
    expect(items[0].text).toBe('Pump');

    const sourceItems = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
    expect(sourceItems.length).toBeGreaterThanOrEqual(2);

    const plain = await PdfRendererAdapter.getPagePlainText(page);
    expect(plain).toBe('Pump Discharge Line');

    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => page),
    } as unknown as PDFDocumentProxy;

    expect(await PdfRendererAdapter.searchDocumentTextInDocument(doc, '   ')).toEqual([]);
    const hits = await PdfRendererAdapter.searchDocumentTextInDocument(doc, 'discharge');
    expect(hits).toHaveLength(1);
    expect(hits[0].pageNumber).toBe(1);
    expect(hits[0].rects.length).toBeGreaterThan(0);

    const failingPage = makeMockPage({
      getTextContent: vi.fn(async () => {
        throw new Error('broken stream');
      }),
    });
    expect(await PdfRendererAdapter.getPageTextItems(failingPage, 1)).toEqual([]);
    await expect(PdfRendererAdapter.getPageTextItems(failingPage, 1, undefined, { strict: true })).rejects.toThrow('broken stream');
    expect(await PdfRendererAdapter.getPagePlainText(failingPage)).toBe('');
    expect(await PdfRendererAdapter.getPageExistingTextSourceItems(failingPage)).toEqual([]);
  });

  it('flattens document outlines across direct, named, nested, null, and failing destinations', async () => {
    const doc = {
      getOutline: vi.fn(async () => [
        {
          title: 'Section 1',
          dest: [{ num: 1 }],
          items: [{ title: '', dest: 'named-dest', items: [] }],
        },
      ]),
      getDestination: vi.fn(async () => [{ num: 2 }]),
      getPageIndex: vi.fn(async (ref: { num: number }) => ref.num - 1),
    } as unknown as PDFDocumentProxy;

    const flat = await PdfRendererAdapter.getOutlineFlat(doc);
    expect(flat).toEqual([
      { id: 'outline-0', title: 'Section 1', pageNumber: 1, depth: 0 },
      { id: 'outline-1', title: 'Bookmark 2', pageNumber: 2, depth: 1 },
    ]);

    const emptyDoc = { getOutline: vi.fn(async () => null) } as unknown as PDFDocumentProxy;
    expect(await PdfRendererAdapter.getOutlineFlat(emptyDoc)).toEqual([]);

    const brokenDoc = {
      getOutline: vi.fn(async () => {
        throw new Error('outline unreadable');
      }),
    } as unknown as PDFDocumentProxy;
    expect(await PdfRendererAdapter.getOutlineFlat(brokenDoc)).toEqual([]);
    expect(PdfRendererAdapter.isTransportDestroyedError(new Error('Transport destroyed'))).toBe(true);
  });
});
