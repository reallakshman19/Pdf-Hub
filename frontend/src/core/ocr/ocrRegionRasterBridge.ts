import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { OcrDiagnostic } from './types';
import type { OcrRegion } from './ocrRegionModel';
import type {
  PdfRasterImageMimeType,
  PdfRasterizerDocumentLike,
  PdfPageRasterizerOptions,
  RasterizedPdfPage,
} from './pdfPageRasterizer';
import {
  calculateAdaptiveOcrScale,
  rasterizePdfPageForOcr,
  rasterizedPdfPageToOcrEnginePageInput,
} from './pdfPageRasterizer';
import type { OcrPreprocessingOptions } from './preprocessing/ocrImagePreprocessor';

export interface ResolveOcrRegionPageInputInput extends PdfPageRasterizerOptions {
  region: OcrRegion;
  pdfBytes?: Uint8Array | null;
  document?: PdfRasterizerDocumentLike | null;
  fallbackPageInput?: OcrEnginePageInput | null;
}

export interface ResolveOcrRegionPageInputResult {
  pageInput: OcrEnginePageInput;
  rasterizedPage: RasterizedPdfPage | null;
  source: 'pdf-raster' | 'fallback';
  diagnostics: OcrDiagnostic[];
}

export interface RasterizeOcrRegionToPageInputInput {
  region: OcrRegion;
  pdfBytes?: Uint8Array | null;
  document?: PdfRasterizerDocumentLike | null;
  scale?: number;
  maxCanvasPixels?: number;
  mimeType?: PdfRasterImageMimeType;
  quality?: number;
  canvasFactory?: PdfPageRasterizerOptions['canvasFactory'];
  preprocessing?: OcrPreprocessingOptions;
  signal?: AbortSignal;
}

export async function resolveOcrRegionPageInput(
  input: ResolveOcrRegionPageInputInput,
): Promise<ResolveOcrRegionPageInputResult> {
  if (input.pdfBytes || input.document) {
    return rasterizeOcrRegionToPageInput(input);
  }

  if (input.fallbackPageInput) {
    return {
      pageInput: normalizeFallbackRegionPageInput(
        input.fallbackPageInput,
        input.region,
      ),
      rasterizedPage: null,
      source: 'fallback',
      diagnostics: [
        {
          level: 'info',
          code: 'OCR_REGION_RASTERIZED',
          pageIndex: input.region.pageIndex,
          message: 'Using fallback OCR page input for selected region.',
        },
      ],
    };
  }

  throw new Error('No PDF bytes, PDF document, or fallback page input supplied for OCR region.');
}

export async function rasterizeOcrRegionToPageInput(
  input: RasterizeOcrRegionToPageInputInput,
): Promise<ResolveOcrRegionPageInputResult> {
  const scale = input.scale ?? calculateAdaptiveOcrScale({
    width: input.region.bbox.width,
    height: input.region.bbox.height,
    targetDpi: 300,
    maxCanvasPixels: input.maxCanvasPixels,
    isRegionCrop: true,
  });

  const rasterizedPage = await rasterizePdfPageForOcr({
    pdfBytes: input.pdfBytes ?? undefined,
    document: input.document ?? undefined,
    pageIndex: input.region.pageIndex,
    region: input.region.bbox,
    scale,
    maxCanvasPixels: input.maxCanvasPixels,
    mimeType: input.mimeType ?? 'image/png',
    quality: input.quality ?? 0.92,
    canvasFactory: input.canvasFactory,
    preprocessing: input.preprocessing ?? { mode: 'sauvola' },
    signal: input.signal,
  });

  const pageInput = rasterizedPdfPageToOcrEnginePageInput(rasterizedPage);

  return {
    pageInput: {
      ...pageInput,
      region: input.region.bbox,
    },
    rasterizedPage,
    source: 'pdf-raster',
    diagnostics: rasterizedPage.diagnostics,
  };
}

export function normalizeFallbackRegionPageInput(
  pageInput: OcrEnginePageInput,
  region: OcrRegion,
): OcrEnginePageInput {
  return {
    ...pageInput,
    pageIndex: region.pageIndex,
    width: region.bbox.width,
    height: region.bbox.height,
    region: region.bbox,
  };
}
