import { afterEach, describe, expect, it, vi } from 'vitest';

import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  buildPageGraphFromPdfBytes,
  createInitialPageId,
  rekeyPageGraph,
} from './pageGraphAdmission';

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
      },
      {
        pageId: 'sha256:fixture::page::2',
        documentKey: 'sha256:fixture',
        originalPageNumber: 2,
        currentIndex: 1,
        width: 842,
        height: 595,
        rotation: 90,
      },
    ]);
    expect(first.cleanup).toHaveBeenCalledTimes(1);
    expect(second.cleanup).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('normalizes unsupported PDF rotations without changing metrics', async () => {
    const sourcePage = page(1, 600, 800, 45);
    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: {
        numPages: 1,
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
});
