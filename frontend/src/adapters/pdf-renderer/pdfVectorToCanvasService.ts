import type { PDFPageProxy } from 'pdfjs-dist';
import type { ScaleCalibration } from '@/core/annotations/calibration';
import type { PdfAnnotation } from '@/core/annotations/types';
import type {
  CadPageVectorExtractResult,
  CadVectorExtractOptions,
} from '@/core/cad-geometry/types';
import {
  attachNearbyBranchLabels,
  convertPdfVectorsToAnnotations,
  type PdfVectorImportOptions,
  type PdfVectorImportStats,
} from '@/core/cad-geometry/pdfToCanvasAnnotations';
import { computeRectFromPagePoints } from '@/core/annotations/pointsSpace';
import { info, warn } from '@/core/logger/service';
import type { PageId } from '@/core/pages/types';
import { PdfRendererAdapter } from './PdfRendererAdapter';
import { vectorizeRasterImage } from '@/core/raster-vectorize/rasterVectorizeClient';
import { pixelPolylinesToPdfPoints } from '@/core/raster-vectorize/pixelToPdfCoords';
import type { RasterVectorizeOptions } from '@/core/raster-vectorize/types';

export type VectorPortTargetMode = 'pipe' | 'cad';

export interface PortPdfVectorsOptions {
  mode?: VectorPortTargetMode;
  pageId?: PageId;
  calibration?: ScaleCalibration;
  extract?: CadVectorExtractOptions;
  import?: Omit<PdfVectorImportOptions, 'pageNumber' | 'pageId' | 'calibration'>;
  attachBranchLabels?: boolean;
  branchMatchMaxDistancePt?: number;
  /**
   * When `true` and the page is detected as raster-only, automatically run the
   * raster-vectorize pipeline (threshold → thin → trace) to extract pipe-run
   * centerlines.  The resulting annotations have `importedFromRasterTrace: true`
   * and `coordinateSpace: 'page'`.
   *
   * @default false
   */
  autoTraceRaster?: boolean;
  /** Options forwarded to the raster-vectorize pipeline. */
  rasterVectorize?: RasterVectorizeOptions;
}

export interface PortPdfVectorsResult {
  annotations: PdfAnnotation[];
  extractResult: CadPageVectorExtractResult;
  stats: PdfVectorImportStats;
  attachedBranchCount: number;
  layersDetected: string[];
  imageXObjectCount: number;
  isRasterOnlyLikely: boolean;
  /** Number of polylines produced by the raster auto-trace pipeline (0 if not run). */
  rasterTracePolylines: number;
}

/**
 * Orchestrates Layer 1 (`PdfRendererAdapter.extractPageVectors`) and Layer 2
 * (`convertPdfVectorsToAnnotations` + `attachNearbyBranchLabels`) into a single
 * Canvas & Piping-ready annotation batch for a PDF page or dragged ROI region.
 *
 * Layer 5 extension: when `options.autoTraceRaster` is `true` and the page is
 * detected as raster-only, the raster-vectorize pipeline runs automatically and
 * returns `perimeter-takeoff` annotations with `importedFromRasterTrace: true`.
 */
export async function portPdfPageVectorsToAnnotations(
  page: PDFPageProxy,
  options: PortPdfVectorsOptions = {},
  signal?: AbortSignal,
): Promise<PortPdfVectorsResult> {
  const mode = options.mode ?? 'pipe';
  const extractResult = await PdfRendererAdapter.extractPageVectors(
    page,
    options.extract,
    signal,
  );

  const importOpts: PdfVectorImportOptions = {
    pageNumber: page.pageNumber,
    ...(options.pageId ? { pageId: options.pageId } : {}),
    ...(options.calibration ? { calibration: options.calibration } : {}),
    defaultPolylineType: mode === 'pipe' ? 'perimeter-takeoff' : 'line',
    markPolylinesAsPipeRun: mode === 'pipe',
    promoteClosedPolygons: mode === 'cad',
    importTextLabels: options.import?.importTextLabels ?? true,
    ...options.import,
  };

  const imported = convertPdfVectorsToAnnotations(extractResult, importOpts);
  let finalAnnotations = imported.annotations;
  let attachedBranchCount = 0;

  if ((options.attachBranchLabels ?? true) && extractResult.textAnchors.length > 0) {
    const labeled = attachNearbyBranchLabels(
      finalAnnotations,
      extractResult.textAnchors,
      options.branchMatchMaxDistancePt ?? 36,
    );
    finalAnnotations = labeled.annotations;
    attachedBranchCount = labeled.attachedCount;
  }

  // ── Layer 5: Raster auto-trace ──────────────────────────────────────────
  let rasterTracePolylines = 0;

  if (extractResult.isRasterOnlyLikely && options.autoTraceRaster) {
    try {
      const viewport = page.getViewport({ scale: 1 });
      const regionRect = options.extract?.regionRect;

      const imageData = await PdfRendererAdapter.rasterizePageRegion(page, {
        scale: 1,
        regionRect,
        signal,
      });

      const pixelPolylines = await vectorizeRasterImage(
        imageData,
        options.rasterVectorize ?? {},
        signal,
      );

      // Convert pixel coords → DocCraft unscaled top-left page view-space
      const pageRect = regionRect
        ? regionRect
        : { x: 0, y: 0, width: viewport.width, height: viewport.height };

      const pdfPointArrays = pixelPolylinesToPdfPoints(
        pixelPolylines,
        imageData.width,
        imageData.height,
        pageRect,
      );

      const now = Date.now();
      const tracedAnnotations: PdfAnnotation[] = pdfPointArrays
        .filter((pts) => pts.length >= 4)
        .map((pts) => {
          const rect = computeRectFromPagePoints(pts, 8);
          return {
            id: `raster-trace-${globalThis.crypto.randomUUID()}`,
            type: mode === 'pipe' ? ('perimeter-takeoff' as const) : ('line' as const),
            ...(options.pageId ? { pageId: options.pageId } : {}),
            pageNumber: page.pageNumber,
            rect,
            data: {
              points: pts,
              coordinateSpace: 'page' as const,
              importedFromRasterTrace: true,
              ...(mode === 'pipe' ? { isPipeRun: true } : {}),
              borderColor: '#1d6fdb',
              borderWidth: 1.5,
              borderStyle: 'solid' as const,
              ...(options.calibration
                ? {
                    dimensionScale: options.calibration.scaleRatio,
                    dimensionUnit: options.calibration.unit,
                    dimensionPrecision: options.calibration.precision,
                  }
                : {}),
            },
            createdAt: now,
            updatedAt: now,
          };
        });

      rasterTracePolylines = tracedAnnotations.length;

      // Run branch-label attachment on the traced annotations if text anchors exist
      if ((options.attachBranchLabels ?? true) && extractResult.textAnchors.length > 0) {
        const labeled = attachNearbyBranchLabels(
          tracedAnnotations,
          extractResult.textAnchors,
          options.branchMatchMaxDistancePt ?? 36,
        );
        finalAnnotations = [...finalAnnotations, ...labeled.annotations];
        attachedBranchCount += labeled.attachedCount;
      } else {
        finalAnnotations = [...finalAnnotations, ...tracedAnnotations];
      }

      info('annotation', 'Raster auto-trace completed', {
        pageNumber: page.pageNumber,
        polylines: rasterTracePolylines,
        imageWidth: imageData.width,
        imageHeight: imageData.height,
      });
    } catch (rasterErr) {
      warn('annotation', 'Raster auto-trace failed; continuing without traced annotations', {
        pageNumber: page.pageNumber,
        error: rasterErr instanceof Error ? rasterErr.message : String(rasterErr),
      });
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  info('annotation', 'Ported PDF page vectors to canvas annotations', {
    pageNumber: page.pageNumber,
    mode,
    annotationsCount: finalAnnotations.length,
    polylines: imported.stats.polylinesCreated,
    lines: imported.stats.linesCreated,
    rects: imported.stats.rectsCreated,
    polygons: imported.stats.polygonsCreated,
    labels: imported.stats.labelsCreated,
    attachedBranchCount,
    isRasterOnlyLikely: extractResult.isRasterOnlyLikely,
    rasterTracePolylines,
  });

  return {
    annotations: finalAnnotations,
    extractResult,
    stats: imported.stats,
    attachedBranchCount,
    layersDetected: extractResult.layersDetected,
    imageXObjectCount: extractResult.imageXObjectCount,
    isRasterOnlyLikely: extractResult.isRasterOnlyLikely,
    rasterTracePolylines,
  };
}
