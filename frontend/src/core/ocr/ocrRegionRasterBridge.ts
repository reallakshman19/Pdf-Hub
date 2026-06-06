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
  rasterizePdfPageForOcr,
  rasterizedPdfPageToOcrEnginePageInput,
} from './pdfPageRasterizer';

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
  const rasterizedPage = await rasterizePdfPageForOcr({
    pdfBytes: input.pdfBytes ?? undefined,
    document: input.document ?? undefined,
    pageIndex: input.region.pageIndex,
    region: input.region.bbox,
    scale: input.scale ?? 2,
    maxCanvasPixels: input.maxCanvasPixels,
    mimeType: input.mimeType ?? 'image/png',
    quality: input.quality ?? 0.92,
    canvasFactory: input.canvasFactory,
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
