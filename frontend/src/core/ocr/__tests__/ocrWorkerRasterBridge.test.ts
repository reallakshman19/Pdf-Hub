import {
  describe,
  expect,
  it,
} from 'vitest';
import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import type { OcrRasterWorkerClient } from '../workers/ocrRasterWorkerClient';
import {
  rasterizeForOcrWithOptionalWorker,
  rasterizeRegionForOcrWithOptionalWorker,
  rasterWorkerProgressToMessage,
} from '../ocrWorkerRasterBridge';

describe('ocrWorkerRasterBridge', () => {
  it('uses worker client for full-page rasterization when worker mode is enabled', async () => {
    let disposed = false;
    const progressMessages: string[] = [];

    const client = {
      async rasterizePages(payload, options) {
        expect(payload.pageIndexes).toEqual([0, 1]);
        expect(payload.scale).toBe(2);
        options?.onProgress?.({
          status: 'running',
          completedPages: 0,
          totalPages: 2,
          message: 'Raster running.',
        });

        return [
          makePageInput(0),
          makePageInput(1),
        ];
      },
      dispose() {
        disposed = true;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const pages = await rasterizeForOcrWithOptionalWorker({
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndexes: [0, 1],
      scale: 2,
      maxCanvasPixels: 16_000_000,
      useWorker: true,
      workerClient: client,
      disposeClientAfterRun: true,
      onProgress: (progress) => {
        progressMessages.push(progress.message ?? '');
      },
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].pageIndex).toBe(0);
    expect(progressMessages).toEqual(['Raster running.']);
    expect(disposed).toBe(true);
  });

  it('uses worker client for region rasterization when worker mode is enabled', async () => {
    const client = {
      async rasterizeRegion(payload) {
        expect(payload.pageIndex).toBe(2);
        expect(payload.region).toEqual({
          x: 10,
          y: 20,
          width: 100,
          height: 40,
        });

        return [
          {
            ...makePageInput(2),
            width: 100,
            height: 40,
            region: payload.region,
          },
        ];
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizeRegion' | 'dispose'>;

    const page = await rasterizeRegionForOcrWithOptionalWorker({
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndex: 2,
      region: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      },
      scale: 2,
      maxCanvasPixels: 16_000_000,
      useWorker: true,
      workerClient: client,
    });

    expect(page.pageIndex).toBe(2);
    expect(page.width).toBe(100);
    expect(page.height).toBe(40);
    expect(page.region).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
  });

  it('throws when worker returns no region page input', async () => {
    const client = {
      async rasterizeRegion() {
        return [];
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizeRegion' | 'dispose'>;

    await expect(
      rasterizeRegionForOcrWithOptionalWorker({
        pdfBytes: new Uint8Array([1, 2, 3]),
        pageIndex: 0,
        region: {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
        scale: 2,
        maxCanvasPixels: 16_000_000,
        useWorker: true,
        workerClient: client,
      }),
    ).rejects.toThrow('returned no region page input');
  });

  it('uses progress message helper', () => {
    expect(
      rasterWorkerProgressToMessage({
        status: 'running',
        completedPages: 0,
        totalPages: 2,
        message: 'Custom message',
      }),
    ).toBe('Custom message');

    expect(
      rasterWorkerProgressToMessage({
        status: 'page-completed',
        completedPages: 1,
        totalPages: 2,
      }),
    ).toBe('Rasterized 1/2 page(s).');

    expect(
      rasterWorkerProgressToMessage({
        status: 'completed',
        completedPages: 2,
        totalPages: 2,
      }),
    ).toBe('OCR rasterization completed.');
  });
});

function makePageInput(pageIndex: number): OcrEnginePageInput {
  return {
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
  };
}
