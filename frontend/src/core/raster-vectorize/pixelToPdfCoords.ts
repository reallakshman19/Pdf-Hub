/**
 * Coordinate conversion: rasterized pixel space → DocCraft top-left page view-space.
 *
 * DocCraft page view-space (`coordinateSpace: 'page'`):
 *   (0, 0) at top-left, Y increases downward, units are unscaled PDF points (scale = 1).
 *
 * Raster pixel space (`ImageData` rendered via `pdfjs-dist` viewport):
 *   (0, 0) at top-left, Y increases downward, units are image pixels.
 *
 * Both frames share top-left origin and Y-down orientation, so conversion maps
 * linearly onto the rendered `pageRect` without flipping Y:
 *
 *   viewX = pageRect.x + (px / imgWidth)  * pageRect.width
 *   viewY = pageRect.y + (py / imgHeight) * pageRect.height
 *
 * No DOM dependencies — safe inside a Web Worker.
 */

import type { PixelPolyline } from './types';

/** A rectangle in DocCraft unscaled top-left page view-space. */
export interface PageRect {
  /** X coordinate of the left edge (from left of page, unscaled). */
  x: number;
  /** Y coordinate of the top edge (from top of page, unscaled). */
  y: number;
  /** Width in unscaled page points. */
  width: number;
  /** Height in unscaled page points. */
  height: number;
}

/**
 * Convert a single pixel polyline into a flat `[x0, y0, ...]` array in
 * DocCraft top-left page view-space.
 *
 * @param polyline    - Pixel-space polyline (points are [px,py,...]).
 * @param imgWidth    - Width of the rasterized image in pixels.
 * @param imgHeight   - Height of the rasterized image in pixels.
 * @param pageRect    - Bounding box (in top-left unscaled page view-space) of
 *                      the rasterized region on the page. For a full-page raster,
 *                      this is `{ x: 0, y: 0, width: viewport.width, height: viewport.height }`.
 */
export function pixelPolylineToPdfPoints(
  polyline: PixelPolyline,
  imgWidth: number,
  imgHeight: number,
  pageRect: PageRect,
): number[] {
  if (imgWidth <= 0 || imgHeight <= 0) {
    return [];
  }
  const { x: rx, y: ry, width: rw, height: rh } = pageRect;
  const pts = polyline.points;
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const px = pts[i];
    const py = pts[i + 1];
    const viewX = Math.round((rx + (px / imgWidth) * rw) * 1000) / 1000;
    const viewY = Math.round((ry + (py / imgHeight) * rh) * 1000) / 1000;
    out.push(viewX, viewY);
  }
  return out;
}

/**
 * Convert an array of pixel polylines to DocCraft page view-space coordinate arrays.
 *
 * @param polylines - Output of `traceSkeletonToPolylines`.
 * @param imgWidth  - Width of the rasterized image in pixels.
 * @param imgHeight - Height of the rasterized image in pixels.
 * @param pageRect  - Bounding box of the rasterized region in page view-space.
 * @returns An array of flat `[x0, y0, ...]` number arrays.
 */
export function pixelPolylinesToPdfPoints(
  polylines: PixelPolyline[],
  imgWidth: number,
  imgHeight: number,
  pageRect: PageRect,
): number[][] {
  return polylines.map((pl) => pixelPolylineToPdfPoints(pl, imgWidth, imgHeight, pageRect));
}
