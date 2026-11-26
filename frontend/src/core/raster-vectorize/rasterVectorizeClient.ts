/**
 * Main-thread client for the raster-vectorize Web Worker.
 *
 * Wraps the worker with a Promise-based API so callers never need to manage
 * `onmessage`/`onerror` handlers directly. Runs the full raster pipeline
 * (binarize → thin → trace) in a background thread when `Worker` is available,
 * and falls back transparently to the async chunked sync helper when running
 * in Worker-less test/SSR environments.
 */

import type { PixelPolyline, RasterVectorizeOptions, RasterWorkerRequest, RasterWorkerResponse } from './types';

/** @internal Convert an RGBA `ImageData` to a flat grayscale `Uint8ClampedArray`. */
function rgbaToGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // ITU-R BT.601 luminance weights
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Run the raster-vectorize pipeline on an `ImageData` object.
 *
 * The pipeline (binarize → Zhang-Suen thin → trace polylines) executes in a
 * dedicated Web Worker so the main thread is never blocked when `Worker` is
 * supported by the runtime. Falls back to `vectorizeRasterImageSync` when
 * `Worker` is unavailable (e.g., jsdom unit tests / SSR).
 *
 * @param imageData - RGBA image data, e.g. from `ctx.getImageData(...)`.
 * @param options   - Binarization and tracing options.
 * @param signal    - Optional `AbortSignal`; rejects the promise if aborted.
 * @returns An array of simplified polylines in pixel coordinates.
 */
export async function vectorizeRasterImage(
  imageData: ImageData,
  options: RasterVectorizeOptions = {},
  signal?: AbortSignal,
): Promise<PixelPolyline[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (typeof globalThis.Worker === 'undefined') {
    return vectorizeRasterImageSync(imageData, options, signal);
  }

  let worker: Worker;
  try {
    worker = new Worker(
      new URL('./rasterVectorizeWorker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch {
    return vectorizeRasterImageSync(imageData, options, signal);
  }

  return new Promise<PixelPolyline[]>((resolve, reject) => {
    const onAbort = () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<RasterWorkerResponse>) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(event.data.polylines);
    };

    worker.onerror = (err: ErrorEvent) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      reject(new Error(`Raster-vectorize worker error: ${err.message}`));
    };

    const grayPixels = rgbaToGrayscale(imageData);

    const request: RasterWorkerRequest = {
      grayPixels,
      width: imageData.width,
      height: imageData.height,
      options,
    };

    // Transfer the ArrayBuffer so the worker owns it (zero-copy).
    worker.postMessage(request, [grayPixels.buffer]);
  });
}

/**
 * Fallback for environments where `Worker` is unavailable (unit tests, SSR).
 */
export async function vectorizeRasterImageSync(
  imageData: ImageData,
  options: RasterVectorizeOptions = {},
  signal?: AbortSignal,
): Promise<PixelPolyline[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const { binarizeGrayscale } = await import('./imageThreshold');
  const { thinBinaryImage }   = await import('./zhangSuenThinning');
  const { traceSkeletonToPolylines } = await import('./polylineTracer');

  const grayPixels = rgbaToGrayscale(imageData);
  const binary = binarizeGrayscale(
    grayPixels,
    imageData.width,
    imageData.height,
    options.method ?? 'otsu',
    options.bradleyWindowFraction ?? 0.08,
    options.bradleyT ?? 0.15,
  );
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const skeleton = thinBinaryImage(binary, imageData.width, imageData.height);
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return traceSkeletonToPolylines(skeleton, imageData.width, imageData.height, {
    rdpEpsilonPx: options.rdpEpsilonPx ?? 1.5,
    minLengthPx:  options.minLengthPx  ?? 20,
  });
}
