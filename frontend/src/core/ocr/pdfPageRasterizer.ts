import {
  getDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist';
import type {
  OcrDiagnostic,
} from './types';
import type {
  OcrEnginePageInput,
} from './engines/ocrEngineContract';
import type {
  PdfRect,
} from '../writer-v2/types';

export type PdfRasterImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp';

export interface PdfRasterizerViewport {
  width: number;
  height: number;
  convertToPdfPoint?: (x: number, y: number) => number[];
  convertToViewportRectangle?: (rect: number[]) => number[];
}

export interface PdfRasterizerRenderTask {
  promise: Promise<void>;
  cancel?: () => void;
}

export interface PdfRasterizerPageLike {
  pageNumber: number;
  /** PDF.js source user-space bounds, including CropBox offsets. */
  view?: number[];
  getViewport: (input: { scale: number }) => PdfRasterizerViewport;
  render: (input: {
    canvas: unknown;
    canvasContext: unknown;
    viewport: PdfRasterizerViewport;
  }) => PdfRasterizerRenderTask;
}

export interface PdfRasterizerDocumentLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfRasterizerPageLike>;
  destroy?: () => Promise<void>;
}

export interface PdfRasterCanvasHandle {
  canvas: unknown;
  context: unknown;
  width: number;
  height: number;
  toBytes: (
    mimeType: PdfRasterImageMimeType,
    quality?: number,
  ) => Promise<Uint8Array>;
  cropToBytes: (
    crop: PdfRasterCropRect,
    mimeType: PdfRasterImageMimeType,
    quality?: number,
  ) => Promise<Uint8Array>;
  dispose?: () => void;
}

export interface PdfRasterCanvasFactory {
  createCanvas: (
    width: number,
    height: number,
  ) => PdfRasterCanvasHandle;
}

export interface PdfRasterCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageRasterizerOptions {
  scale?: number;
  maxCanvasPixels?: number;
  mimeType?: PdfRasterImageMimeType;
  quality?: number;
  canvasFactory?: PdfRasterCanvasFactory;
}

export interface RasterizePdfPageInput extends PdfPageRasterizerOptions {
  pdfBytes?: Uint8Array;
  document?: PdfRasterizerDocumentLike;
  pageIndex: number;
  region?: PdfRect;
}

export interface RasterizePdfPagesInput extends PdfPageRasterizerOptions {
  pdfBytes?: Uint8Array;
  document?: PdfRasterizerDocumentLike;
  pageIndexes: number[];
}

export interface RasterizedPdfPage {
  pageIndex: number;
  pageNumber: number;
  imageBytes: Uint8Array;
  width: number;
  height: number;
  rasterWidth: number;
  rasterHeight: number;
  scale: number;
  region?: PdfRect;
  pixelToPdfTransform?: readonly [number, number, number, number, number, number];
  diagnostics: OcrDiagnostic[];
}

export interface RasterizePdfPagesResult {
  pages: RasterizedPdfPage[];
  diagnostics: OcrDiagnostic[];
}

export interface PdfPageRasterizerWorkerOptions {
  workerSrc: string;
}

let workerConfigured = false;

export function configurePdfPageRasterizerWorker(
  options: PdfPageRasterizerWorkerOptions,
): void {
  if (workerConfigured) return;

  GlobalWorkerOptions.workerSrc = options.workerSrc;
  workerConfigured = true;
}

export async function loadPdfDocumentForOcrRasterizer(
  pdfBytes: Uint8Array,
): Promise<PdfRasterizerDocumentLike> {
  const data = new Uint8Array(pdfBytes);
  const task = getDocument({ data });
  return task.promise as unknown as Promise<PdfRasterizerDocumentLike>;
}

export async function rasterizePdfPageForOcr(
  input: RasterizePdfPageInput,
): Promise<RasterizedPdfPage> {
  const document = await resolvePdfRasterizerDocument(input);
  const pageNumber = input.pageIndex + 1;

  if (pageNumber < 1 || pageNumber > document.numPages) {
    return {
      pageIndex: input.pageIndex,
      pageNumber,
      imageBytes: new Uint8Array(),
      width: 0,
      height: 0,
      rasterWidth: 0,
      rasterHeight: 0,
      scale: input.scale ?? 2,
      region: input.region,
      diagnostics: [
        {
          level: 'error',
          code: 'INVALID_OCR_RESULT',
          pageIndex: input.pageIndex,
          message: `PDF pageIndex ${input.pageIndex} is outside document page range.`,
        },
      ],
    };
  }

  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const requestedScale = input.scale ?? 2;
  const scale = clampScaleForMaxPixels({
    width: baseViewport.width,
    height: baseViewport.height,
    requestedScale,
    maxCanvasPixels: input.maxCanvasPixels ?? 16_000_000,
  });

  const viewport = page.getViewport({ scale });
  const canvasFactory = input.canvasFactory ?? createBrowserPdfRasterCanvasFactory();
  const canvas = canvasFactory.createCanvas(
    Math.max(1, Math.floor(viewport.width)),
    Math.max(1, Math.floor(viewport.height)),
  );

  const diagnostics: OcrDiagnostic[] = [];

  try {
    const renderTask = page.render({
      canvas: canvas.canvas,
      canvasContext: canvas.context,
      viewport,
    });

    await renderTask.promise;

    const mimeType = input.mimeType ?? 'image/png';
    const quality = input.quality ?? 0.92;

    // OCR regions are stored in unrotated PDF user space, not rendered
    // viewport coordinates. PDF.js owns rotation and CropBox transforms.
    const pdfBounds = page.view && page.view.length === 4
      ? {
          x: page.view[0],
          y: page.view[1],
          width: page.view[2] - page.view[0],
          height: page.view[3] - page.view[1],
        }
      : { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height };

    if (input.region) {
      const validation = validatePdfRegion(input.region, pdfBounds);
      if (validation.length > 0) {
        throw new Error(validation[0].message);
      }
    }

    const crop = input.region
      ? pdfRectToRasterCropRect({
          rect: input.region,
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
          rasterWidth: canvas.width,
          rasterHeight: canvas.height,
          viewport,
        })
      : null;
    const rasterWidth = crop ? Math.max(1, Math.floor(crop.width)) : canvas.width;
    const rasterHeight = crop ? Math.max(1, Math.floor(crop.height)) : canvas.height;

    const imageBytes = crop
      ? await canvas.cropToBytes(crop, mimeType, quality)
      : await canvas.toBytes(mimeType, quality);
    const pixelToPdfTransform = derivePixelToPdfTransform({
      viewport,
      crop,
      rasterWidth,
      rasterHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      fallbackPdfBounds: input.region ?? pdfBounds,
    });

    if (input.region) {
      diagnostics.push({
        level: 'info',
        code: 'OCR_REGION_RASTERIZED',
        pageIndex: input.pageIndex,
        message: 'PDF page region was rasterized for OCR.',
      });
    }

    return {
      pageIndex: input.pageIndex,
      pageNumber,
      imageBytes,
      width: input.region?.width ?? baseViewport.width,
      height: input.region?.height ?? baseViewport.height,
      rasterWidth,
      rasterHeight,
      scale,
      region: input.region,
      pixelToPdfTransform,
      diagnostics,
    };
  } finally {
    canvas.dispose?.();
  }
}

export async function rasterizePdfPagesForOcr(
  input: RasterizePdfPagesInput,
): Promise<RasterizePdfPagesResult> {
  const document = await resolvePdfRasterizerDocument(input);
  const pages: RasterizedPdfPage[] = [];

  for (const pageIndex of normalizePageIndexes(input.pageIndexes)) {
    pages.push(
      await rasterizePdfPageForOcr({
        document,
        pageIndex,
        scale: input.scale,
        maxCanvasPixels: input.maxCanvasPixels,
        mimeType: input.mimeType,
        quality: input.quality,
        canvasFactory: input.canvasFactory,
      }),
    );
  }

  return {
    pages,
    diagnostics: pages.flatMap((page) => page.diagnostics),
  };
}

export function rasterizedPdfPageToOcrEnginePageInput(
  page: RasterizedPdfPage,
): OcrEnginePageInput {
  return {
    pageIndex: page.pageIndex,
    imageBytes: page.imageBytes,
    width: page.width,
    height: page.height,
    region: page.region,
    rasterWidth: page.rasterWidth,
    rasterHeight: page.rasterHeight,
    pixelToPdfTransform: page.pixelToPdfTransform,
  };
}

export function rasterizedPdfPagesToOcrEnginePageInputs(
  pages: RasterizedPdfPage[],
): OcrEnginePageInput[] {
  return pages.map((page) =>
    rasterizedPdfPageToOcrEnginePageInput(page),
  );
}

export function pdfRectToRasterCropRect(input: {
  rect: PdfRect;
  pageWidth: number;
  pageHeight: number;
  rasterWidth: number;
  rasterHeight: number;
  viewport?: PdfRasterizerViewport;
}): PdfRasterCropRect {
  if (input.viewport?.convertToViewportRectangle) {
    const rectangle = input.viewport.convertToViewportRectangle([
      input.rect.x,
      input.rect.y,
      input.rect.x + input.rect.width,
      input.rect.y + input.rect.height,
    ]);
    const scaleX = input.rasterWidth / input.viewport.width;
    const scaleY = input.rasterHeight / input.viewport.height;
    return clampRasterCropRect({
      x: Math.min(rectangle[0], rectangle[2]) * scaleX,
      y: Math.min(rectangle[1], rectangle[3]) * scaleY,
      width: Math.abs(rectangle[2] - rectangle[0]) * scaleX,
      height: Math.abs(rectangle[3] - rectangle[1]) * scaleY,
    }, {
      width: input.rasterWidth,
      height: input.rasterHeight,
    });
  }

  const scaleX = input.rasterWidth / Math.max(1, input.pageWidth);
  const scaleY = input.rasterHeight / Math.max(1, input.pageHeight);

  return clampRasterCropRect(
    {
      x: input.rect.x * scaleX,
      y: (input.pageHeight - input.rect.y - input.rect.height) * scaleY,
      width: input.rect.width * scaleX,
      height: input.rect.height * scaleY,
    },
    {
      width: input.rasterWidth,
      height: input.rasterHeight,
    },
  );
}

export function createBrowserPdfRasterCanvasFactory(): PdfRasterCanvasFactory {
  return {
    createCanvas(width, height) {
      if (typeof document === 'undefined') {
        throw new Error('Browser canvas is unavailable in this runtime.');
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d', {
        willReadFrequently: true,
      });

      if (!context) {
        throw new Error('2D canvas context is unavailable for OCR rasterization.');
      }

      return {
        canvas,
        context,
        width,
        height,
        toBytes: (mimeType, quality) =>
          canvasToBytes(canvas, mimeType, quality),
        cropToBytes: async (crop, mimeType, quality) => {
          const cropped = document.createElement('canvas');
          cropped.width = Math.max(1, Math.floor(crop.width));
          cropped.height = Math.max(1, Math.floor(crop.height));

          const croppedContext = cropped.getContext('2d', {
            willReadFrequently: true,
          });

          if (!croppedContext) {
            throw new Error('2D crop canvas context is unavailable for OCR rasterization.');
          }

          croppedContext.drawImage(
            canvas,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            cropped.width,
            cropped.height,
          );

          return canvasToBytes(cropped, mimeType, quality);
        },
      };
    },
  };
}

export function createMemoryPdfRasterCanvasFactory(): PdfRasterCanvasFactory {
  return {
    createCanvas(width, height) {
      const bytes = createSyntheticRasterBytes(width, height);

      return {
        canvas: {
          width,
          height,
        },
        context: {},
        width,
        height,
        async toBytes() {
          return bytes;
        },
        async cropToBytes(crop) {
          return createSyntheticRasterBytes(
            Math.max(1, Math.floor(crop.width)),
            Math.max(1, Math.floor(crop.height)),
          );
        },
      };
    },
  };
}

function createSyntheticRasterBytes(
  width: number,
  height: number,
): Uint8Array {
  const header = `PDFHUB_RASTER:${Math.floor(width)}x${Math.floor(height)}:`;
  const encoder = new TextEncoder();
  return encoder.encode(header);
}

async function resolvePdfRasterizerDocument(input: {
  pdfBytes?: Uint8Array;
  document?: PdfRasterizerDocumentLike;
}): Promise<PdfRasterizerDocumentLike> {
  if (input.document) {
    return input.document;
  }

  if (!input.pdfBytes) {
    throw new Error('Either pdfBytes or document must be supplied for OCR rasterization.');
  }

  return loadPdfDocumentForOcrRasterizer(input.pdfBytes);
}

function normalizePageIndexes(
  pageIndexes: number[],
): number[] {
  return [...new Set(
    pageIndexes
      .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0),
  )].sort((a, b) => a - b);
}

function clampScaleForMaxPixels(input: {
  width: number;
  height: number;
  requestedScale: number;
  maxCanvasPixels: number;
}): number {
  const basePixels = Math.max(1, input.width * input.height);
  const requestedPixels = basePixels * input.requestedScale * input.requestedScale;

  if (requestedPixels <= input.maxCanvasPixels) {
    return input.requestedScale;
  }

  return Math.max(
    0.25,
    Math.sqrt(input.maxCanvasPixels / basePixels),
  );
}

function validatePdfRegion(
  region: PdfRect,
  page: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): OcrDiagnostic[] {
  const diagnostics: OcrDiagnostic[] = [];

  const valid =
    Number.isFinite(region.x)
    && Number.isFinite(region.y)
    && Number.isFinite(region.width)
    && Number.isFinite(region.height)
    && region.width > 0
    && region.height > 0
    && region.x >= page.x
    && region.y >= page.y
    && region.x + region.width <= page.x + page.width
    && region.y + region.height <= page.y + page.height;

  if (!valid) {
    diagnostics.push({
      level: 'error',
      code: 'OUT_OF_PAGE_BBOX',
      message: 'OCR raster region is outside PDF page bounds.',
    });
  }

  return diagnostics;
}

/**
 * Inverse map from OCR crop pixels to original PDF user-space points.
 * A rotated/CropBox PDF uses PageViewport.convertToPdfPoint; synthetic
 * rasterizers lacking PDF.js coordinates get a conservative 0-degree fallback.
 */
function derivePixelToPdfTransform(input: {
  viewport: PdfRasterizerViewport;
  crop: PdfRasterCropRect | null;
  rasterWidth: number;
  rasterHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  fallbackPdfBounds: PdfRect;
}): readonly [number, number, number, number, number, number] {
  const { viewport, crop, rasterWidth, rasterHeight } = input;
  const pdfAt = (pixelX: number, pixelY: number): number[] => {
    if (viewport.convertToPdfPoint) {
      const rasterX = (crop?.x ?? 0) + pixelX * (crop?.width ?? input.canvasWidth) / rasterWidth;
      const rasterY = (crop?.y ?? 0) + pixelY * (crop?.height ?? input.canvasHeight) / rasterHeight;
      return viewport.convertToPdfPoint(
        rasterX * viewport.width / input.canvasWidth,
        rasterY * viewport.height / input.canvasHeight,
      );
    }
    const bounds = input.fallbackPdfBounds;
    return [
      bounds.x + pixelX * bounds.width / rasterWidth,
      bounds.y + bounds.height - pixelY * bounds.height / rasterHeight,
    ];
  };
  const origin = pdfAt(0, 0);
  const xUnit = pdfAt(1, 0);
  const yUnit = pdfAt(0, 1);
  return [
    xUnit[0] - origin[0],
    xUnit[1] - origin[1],
    yUnit[0] - origin[0],
    yUnit[1] - origin[1],
    origin[0],
    origin[1],
  ];
}

function clampRasterCropRect(
  crop: PdfRasterCropRect,
  raster: {
    width: number;
    height: number;
  },
): PdfRasterCropRect {
  const x = clamp(crop.x, 0, raster.width);
  const y = clamp(crop.y, 0, raster.height);
  const right = clamp(crop.x + crop.width, 0, raster.width);
  const bottom = clamp(crop.y + crop.height, 0, raster.height);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(value, max));
}

async function canvasToBytes(
  canvas: HTMLCanvasElement,
  mimeType: PdfRasterImageMimeType,
  quality?: number,
): Promise<Uint8Array> {
  if (canvas.toBlob) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value);
          else reject(new Error('Canvas toBlob returned null.'));
        },
        mimeType,
        quality,
      );
    });

    return new Uint8Array(await blob.arrayBuffer());
  }

  const dataUrl = canvas.toDataURL(mimeType, quality);
  return dataUrlToBytes(dataUrl);
}

function dataUrlToBytes(
  dataUrl: string,
): Uint8Array {
  const [, base64 = ''] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
