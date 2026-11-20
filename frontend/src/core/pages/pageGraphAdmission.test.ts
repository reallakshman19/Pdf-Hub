import { afterEach, describe, expect, it, vi } from 'vitest';

import { PDFDocument } from 'pdf-lib';

import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  buildPageGraphFromPdfBytes,
  createInitialPageId,
} from './pageGraphAdmission';
import { createPageGraph, rekeyPageGraph, reorderPageGraph } from './pageGraph';
import { reanchorPageLabelRangesAfterGraphChange } from './pageLabels';
import { writePdfPageLabels } from './pdfPageLabelWriter';

afterEach(() => {
  vi.restoreAllMocks();
});

function page(pageNumber: number, width: number, height: number, rotate: number) {
  return {
    pageNumber,
    rotate,
    getViewport: vi.fn(() => ({ width, height })),
    cleanup: vi.fn(),
  };
}

describe('PageGraph PDF admission', () => {
  it('builds stable page identities from real PDF.js metrics and rotation', async () => {
    const first = page(1, 595, 842, 0);
    const second = page(2, 842, 595, 90);
    const release = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: {
        numPages: 2,
        getPageLabels: vi.fn().mockResolvedValue(['Cover', 'i']),
        getPage,
      },
      cacheKey: 'fixture',
      release,
    } as never);

    const graph = await buildPageGraphFromPdfBytes(
      new Uint8Array([1, 2, 3]),
      'sha256:fixture',
    );

    expect(graph.pages).toEqual([
      {
        pageId: 'sha256:fixture::page::1',
        documentKey: 'sha256:fixture',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
        logicalLabel: 'Cover',
      },
      {
        pageId: 'sha256:fixture::page::2',
        documentKey: 'sha256:fixture',
        originalPageNumber: 2,
        currentIndex: 1,
        width: 842,
        height: 595,
        rotation: 90,
        logicalLabel: 'i',
      },
    ]);
    expect(first.cleanup).toHaveBeenCalledTimes(1);
    expect(second.cleanup).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('admits actual native prefix, roman and restarted body label rules for later structural mutation', async () => {
    const nativeDoc = await PDFDocument.create();
    for (let i = 0; i < 5; i += 1) nativeDoc.addPage([595, 842]);
    const sourceGraph = createPageGraph(
      Array.from({ length: 5 }, (_, i) => ({
        pageId: 'raw-' + i,
        documentKey: 'raw',
        originalPageNumber: i + 1,
        currentIndex: i,
        width: 595,
        height: 842,
        rotation: 0 as const,
      })),
    );
    const ranges = [
      { startPageId: 'raw-0', prefix: 'Cover' },
      { startPageId: 'raw-1', style: 'roman-lower' as const },
      { startPageId: 'raw-3', style: 'decimal' as const, prefix: 'Body-', startNumber: 7 },
    ];
    const labeled = await writePdfPageLabels(
      new Uint8Array(await nativeDoc.save()),
      sourceGraph,
      ranges,
    );
    const labels = ['Cover', 'i', 'ii', 'Body-7', 'Body-8'];
    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: {
        numPages: 5,
        getPageLabels: vi.fn().mockResolvedValue(labels),
        getPage: vi.fn(async (index: number) => page(index, 595, 842, 0)),
      },
      cacheKey: 'native-label-fixture',
      release: vi.fn().mockResolvedValue(undefined),
    } as never);

    const admitted = await buildPageGraphFromPdfBytes(labeled.bytes, 'sha256:native');
    expect(admitted.pageLabelRanges).toEqual([
      { startPageId: 'sha256:native::page::1', prefix: 'Cover' },
      { startPageId: 'sha256:native::page::2', style: 'roman-lower' },
      {
        startPageId: 'sha256:native::page::4',
        style: 'decimal',
        prefix: 'Body-',
        startNumber: 7,
      },
    ]);
    const reordered = reorderPageGraph(
      admitted,
      ['sha256:native::page::4', 'sha256:native::page::5'],
      0,
    );
    const after = reanchorPageLabelRangesAfterGraphChange(admitted, reordered);
    expect(after.pages.map((item) => item.logicalLabel)).toEqual([
      'Body-7', 'Body-8', 'Cover', 'i', 'ii',
    ]);
  });

  it('normalizes unsupported PDF rotations without changing metrics', async () => {
    const sourcePage = page(1, 600, 800, 45);
    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: {
        numPages: 1,
        getPageLabels: vi.fn().mockResolvedValue(null),
        getPage: vi.fn().mockResolvedValue(sourcePage),
      },
      cacheKey: 'fixture',
      release: vi.fn().mockResolvedValue(undefined),
    } as never);

    const graph = await buildPageGraphFromPdfBytes(
      new Uint8Array([9]),
      'sha256:rotation',
    );

    expect(graph.pages[0]).toMatchObject({
      width: 600,
      height: 800,
      rotation: 0,
    });
  });

  it('creates deterministic initial IDs and rekeys document metadata without changing PageId', () => {
    expect(createInitialPageId('doc-a', 3)).toBe('doc-a::page::3');

    const rekeyed = rekeyPageGraph({
      pages: [{
        pageId: 'doc-a::page::1',
        documentKey: 'doc-a',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
      }],
    }, 'doc-b');

    expect(rekeyed.pages[0]).toMatchObject({
      pageId: 'doc-a::page::1',
      documentKey: 'doc-b',
    });
  });

  it('fails soft when PDF page labels are malformed without rejecting PageGraph admission', async () => {
    const sourcePage = page(1, 595, 842, 0);
    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: {
        numPages: 1,
        getPageLabels: vi.fn().mockRejectedValue(new Error('broken PageLabels tree')),
        getPage: vi.fn().mockResolvedValue(sourcePage),
      },
      cacheKey: 'fixture',
      release: vi.fn().mockResolvedValue(undefined),
    } as never);

    const graph = await buildPageGraphFromPdfBytes(
      new Uint8Array([7]),
      'sha256:labels-broken',
    );

    expect(graph.pages).toHaveLength(1);
    expect(graph.pages[0]?.logicalLabel).toBeUndefined();
  });

});
