/**
 * Shared types for the raster-vectorize pipeline.
 * All types are pure (no DOM, no pdfjs-dist references) so they are safe
 * to import from both the main thread and Web Workers.
 */

/** A single polyline extracted from a skeleton image, in pixel coordinates. */
export interface PixelPolyline {
  /** Flattened [x0,y0, x1,y1, ...] in pixel space (top-left origin, Y↓). */
  points: number[];
  /** Approximate arc-length in pixels. */
  lengthPx: number;
}

/** Binarization algorithm to use when converting a grayscale image to binary. */
export type ThresholdMethod = 'otsu' | 'bradley';

/** Options controlling the raster → polyline pipeline. */
export interface RasterVectorizeOptions {
  /**
   * Binarization algorithm.
   * - `'otsu'`    — global histogram-based threshold (fast; works well when
   *                 foreground/background contrast is uniform).
   * - `'bradley'` — local adaptive threshold (slower; handles non-uniform
   *                 illumination common in scanned P&IDs).
   * @default 'otsu'
   */
  method?: ThresholdMethod;

  /**
   * Bradley window radius as a fraction of the shorter image dimension.
   * Ignored when `method !== 'bradley'`.
   * @default 0.08
   */
  bradleyWindowFraction?: number;

  /**
   * Bradley sensitivity constant T (0–1). Lower values → less aggressive.
   * @default 0.15
   */
  bradleyT?: number;

  /**
   * Ramer-Douglas-Peucker epsilon in pixels.  Larger values simplify more
   * aggressively; too-large values lose fine geometry.
   * @default 1.5
   */
  rdpEpsilonPx?: number;

  /**
   * Minimum length (in pixels) of a traced polyline to be retained.
   * Short stray marks (noise, dust) are discarded.
   * @default 20
   */
  minLengthPx?: number;
}

/** Configuration for the Zhang-Suen skeleton tracer. */
export interface TraceOptions {
  /** Ramer-Douglas-Peucker epsilon in pixels. @default 1.5 */
  rdpEpsilonPx?: number;
  /** Minimum arc-length in pixels.  Traces shorter than this are dropped. @default 20 */
  minLengthPx?: number;
}

/** Message sent TO the raster-vectorize worker. */
export interface RasterWorkerRequest {
  /** Raw grayscale pixel data (one byte per pixel). */
  grayPixels: Uint8ClampedArray;
  width: number;
  height: number;
  options: RasterVectorizeOptions;
}

/** Message sent FROM the raster-vectorize worker. */
export interface RasterWorkerResponse {
  polylines: PixelPolyline[];
  /** Milliseconds spent on each pipeline stage. */
  timings: { thresholdMs: number; thinMs: number; traceMs: number };
}
