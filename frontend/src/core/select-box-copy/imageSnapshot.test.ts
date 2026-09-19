import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  renderSelectBoxImageSnapshot,
  renderSelectBoxImageSnapshotFromDocument,
} from './imageSnapshot';

const viewport = {
  pdfWidth: 200,
  pdfHeight: 300,
  scale: 1,
  rotation: 0 as const,
};

function pageFixture() {
  return {
    getViewport: vi.fn().mockReturnValue({
      width: 200,
      height: 300,
    }),
    render: vi.fn().mockReturnValue({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }),
    cleanup: vi.fn(),
  } as never;
}

describe('Select Box image renderer ownership', () => {
  beforeEach(() => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getContext',
    ).mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'toDataURL',
    ).mockReturnValue('data:image/png;base64,fixture');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders from an already-loaded document without acquiring bytes again', async () => {
    const page = pageFixture();
    const doc = {
      getPage: vi.fn().mockResolvedValue(page),
    } as never;
    const acquire = vi.spyOn(
      PdfRendererAdapter,
      'acquireDocument',
    );

    await expect(
      renderSelectBoxImageSnapshotFromDocument({
        doc,
        pageNumber: 1,
        viewport,
        viewportRect: {
          x: 5,
          y: 6,
          width: 20,
          height: 30,
        },
      }),
    ).resolves.toBe(
      'data:image/png;base64,fixture',
    );

    expect(acquire).not.toHaveBeenCalled();
    expect(
      (page as {
        cleanup: ReturnType<typeof vi.fn>;
      }).cleanup,
    ).toHaveBeenCalledTimes(1);
  });

  it('retains the byte wrapper and releases its lease', async () => {
    const page = pageFixture();
    const doc = {
      getPage: vi.fn().mockResolvedValue(page),
    } as never;
    const release = vi.fn().mockResolvedValue(undefined);
    const bytes = Uint8Array.from([4, 5, 6]);

    vi.spyOn(
      PdfRendererAdapter,
      'acquireDocument',
    ).mockResolvedValue({
      doc,
      cacheKey: 'sha256:bytes',
      release,
    });

    await renderSelectBoxImageSnapshot({
      pdfBytes: bytes,
      pageNumber: 1,
      viewport,
      viewportRect: {
        x: 1,
        y: 2,
        width: 10,
        height: 12,
      },
    });

    expect(
      PdfRendererAdapter.acquireDocument,
    ).toHaveBeenCalledWith(bytes);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
