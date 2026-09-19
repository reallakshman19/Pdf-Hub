import { afterEach, describe, expect, it, vi } from 'vitest';

import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  extractSelectBoxCopyFromDocument,
  extractSelectBoxCopyFromPdf,
} from './selectBoxCopyEngine';

const viewport = {
  pdfWidth: 200,
  pdfHeight: 300,
  scale: 1,
  rotation: 0 as const,
};

function pageFixture() {
  return {
    cleanup: vi.fn(),
  } as never;
}

describe('Select Box Copy renderer ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts from an already-loaded document without acquiring bytes again', async () => {
    const page = pageFixture();
    const getPage = vi.fn().mockResolvedValue(page);
    const doc = { getPage } as never;

    const acquire = vi.spyOn(
      PdfRendererAdapter,
      'acquireDocument',
    );
    vi.spyOn(
      PdfRendererAdapter,
      'getPageTextItems',
    ).mockResolvedValue([{
      id: 'text-1',
      text: 'selected',
      x: 10,
      y: 20,
      width: 40,
      height: 12,
      fontSize: 10,
    }]);

    const result =
      await extractSelectBoxCopyFromDocument({
        doc,
        pageNumber: 1,
        viewport,
        viewportRect: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      });

    expect(acquire).not.toHaveBeenCalled();
    expect(getPage).toHaveBeenCalledWith(1);
    expect(result.items).toHaveLength(1);
    expect(result.plainText).toContain('selected');
    expect(
      (page as { cleanup: ReturnType<typeof vi.fn> })
        .cleanup,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps the explicit byte wrapper and releases its lease', async () => {
    const page = pageFixture();
    const doc = {
      getPage: vi.fn().mockResolvedValue(page),
    } as never;
    const release = vi.fn().mockResolvedValue(undefined);
    const bytes = Uint8Array.from([1, 2, 3]);

    vi.spyOn(
      PdfRendererAdapter,
      'acquireDocument',
    ).mockResolvedValue({
      doc,
      cacheKey: 'sha256:bytes',
      release,
    });
    vi.spyOn(
      PdfRendererAdapter,
      'getPageTextItems',
    ).mockResolvedValue([]);

    await extractSelectBoxCopyFromPdf({
      pdfBytes: bytes,
      pageNumber: 1,
      viewport,
      viewportRect: {
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
    });

    expect(
      PdfRendererAdapter.acquireDocument,
    ).toHaveBeenCalledWith(bytes);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
