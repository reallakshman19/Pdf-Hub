import type { PdfRect } from '../writer-v2/types';
import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { PdfRasterImageMimeType } from './pdfPageRasterizer';
import {
  rasterizePdfPageForOcr,
  rasterizePdfPagesForOcr,
  rasterizedPdfPageToOcrEnginePageInput,
  rasterizedPdfPagesToOcrEnginePageInputs,
} from './pdfPageRasterizer';
import type {
  OcrRasterWorkerClient,
} from './workers/ocrRasterWorkerClient';
import {
  createDefaultOcrRasterWorkerClient,
} from './workers/ocrRasterWorkerClient';
import type {
  OcrRasterWorkerProgressPayload,
} from './workers/ocrRasterWorkerTypes';

export interface RasterizeForOcrWithOptionalWorkerInput {
  pdfBytes: Uint8Array;
  pageIndexes: number[];
  scale: number;
  maxCanvasPixels: number;
  mimeType?: PdfRasterImageMimeType;
  quality?: number;
  useWorker?: boolean;
  signal?: AbortSignal;
  workerClient?: Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;
  disposeClientAfterRun?: boolean;
  onProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
}

export interface RasterizeRegionForOcrWithOptionalWorkerInput {
  pdfBytes: Uint8Array;
  pageIndex: number;
  region: PdfRect;
  scale: number;
  maxCanvasPixels: number;
  mimeType?: PdfRasterImageMimeType;
  quality?: number;
  useWorker?: boolean;
  signal?: AbortSignal;
  workerClient?: Pick<OcrRasterWorkerClient, 'rasterizeRegion' | 'dispose'>;
  disposeClientAfterRun?: boolean;
  onProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
}

export async function rasterizeForOcrWithOptionalWorker(
  input: RasterizeForOcrWithOptionalWorkerInput,
): Promise<OcrEnginePageInput[]> {
  if (input.useWorker) {
    const client = input.workerClient ?? createDefaultOcrRasterWorkerClient();
    const shouldDispose = input.disposeClientAfterRun ?? !input.workerClient;

    try {
      return await client.rasterizePages(
        {
          pdfBytes: input.pdfBytes,
          pageIndexes: input.pageIndexes,
          scale: input.scale,
          maxCanvasPixels: input.maxCanvasPixels,
          mimeType: input.mimeType ?? 'image/png',
          quality: input.quality,
        },
        {
          signal: input.signal,
          onProgress: input.onProgress,
        },
      );
    } finally {
      if (shouldDispose) {
        client.dispose();
      }
    }
  }

  const rasterized = await rasterizePdfPagesForOcr({
    pdfBytes: input.pdfBytes,
    pageIndexes: input.pageIndexes,
    scale: input.scale,
    maxCanvasPixels: input.maxCanvasPixels,
    mimeType: input.mimeType ?? 'image/png',
    quality: input.quality,
  });

  return rasterizedPdfPagesToOcrEnginePageInputs(rasterized.pages);
}

export async function rasterizeRegionForOcrWithOptionalWorker(
  input: RasterizeRegionForOcrWithOptionalWorkerInput,
): Promise<OcrEnginePageInput> {
  if (input.useWorker) {
    const client = input.workerClient ?? createDefaultOcrRasterWorkerClient();
    const shouldDispose = input.disposeClientAfterRun ?? !input.workerClient;

    try {
      const pages = await client.rasterizeRegion(
        {
          pdfBytes: input.pdfBytes,
          pageIndex: input.pageIndex,
          region: input.region,
          scale: input.scale,
          maxCanvasPixels: input.maxCanvasPixels,
          mimeType: input.mimeType ?? 'image/png',
          quality: input.quality,
        },
        {
          signal: input.signal,
          onProgress: input.onProgress,
        },
      );

      const page = pages[0];

      if (!page) {
        throw new Error('OCR raster worker returned no region page input.');
      }

      return page;
    } finally {
      if (shouldDispose) {
        client.dispose();
      }
    }
  }

  const rasterized = await rasterizePdfPageForOcr({
    pdfBytes: input.pdfBytes,
    pageIndex: input.pageIndex,
    region: input.region,
    scale: input.scale,
    maxCanvasPixels: input.maxCanvasPixels,
    mimeType: input.mimeType ?? 'image/png',
    quality: input.quality,
  });

  return rasterizedPdfPageToOcrEnginePageInput(rasterized);
}

export function rasterWorkerProgressToMessage(
  progress: OcrRasterWorkerProgressPayload,
): string {
  if (progress.message) {
    return progress.message;
  }

  if (progress.status === 'page-completed') {
    return `Rasterized ${progress.completedPages}/${progress.totalPages} page(s).`;
  }

  if (progress.status === 'completed') {
    return 'OCR rasterization completed.';
  }

  if (progress.status === 'cancelled') {
    return 'OCR rasterization cancelled.';
  }

  if (progress.status === 'failed') {
    return 'OCR rasterization failed.';
  }

  return 'OCR rasterization running.';
}
