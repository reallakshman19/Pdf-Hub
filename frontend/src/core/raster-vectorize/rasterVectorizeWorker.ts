/**
 * Web Worker entry point for the raster-vectorize pipeline.
 *
 * This module runs in an isolated Worker thread and therefore has no access
 * to the DOM or React.  It receives a `RasterWorkerRequest`, runs:
 *
 *   grayscale pixels → binarize → Zhang-Suen thin → trace polylines
 *
 * and posts back a `RasterWorkerResponse`.
 *
 * Usage:
 *   import RasterWorker from './rasterVectorizeWorker?worker';
 *   const worker = new RasterWorker();
 */

import { binarizeGrayscale } from './imageThreshold';
import { thinBinaryImage }   from './zhangSuenThinning';
import { traceSkeletonToPolylines } from './polylineTracer';
import type { RasterWorkerRequest, RasterWorkerResponse } from './types';

self.onmessage = (event: MessageEvent<RasterWorkerRequest>) => {
  const { grayPixels, width, height, options } = event.data;

  const t0 = performance.now();
  const binary = binarizeGrayscale(
    grayPixels,
    width,
    height,
    options.method ?? 'otsu',
    options.bradleyWindowFraction ?? 0.08,
    options.bradleyT ?? 0.15,
  );
  const t1 = performance.now();

  const skeleton = thinBinaryImage(binary, width, height);
  const t2 = performance.now();

  const polylines = traceSkeletonToPolylines(skeleton, width, height, {
    rdpEpsilonPx: options.rdpEpsilonPx ?? 1.5,
    minLengthPx:  options.minLengthPx  ?? 20,
  });
  const t3 = performance.now();

  const response: RasterWorkerResponse = {
    polylines,
    timings: {
      thresholdMs: t1 - t0,
      thinMs:      t2 - t1,
      traceMs:     t3 - t2,
    },
  };

  self.postMessage(response);
};
