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
}

export interface PdfRasterizerRenderTask {
  promise: Promise<void>;
  cancel?: () => void;
}

export interface PdfRasterizerPageLike {
  pageNumber: number;
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

    const imageBytes = input.region
      ? await canvas.cropToBytes(
          pdfRectToRasterCropRect({
            rect: input.region,
            pageWidth: baseViewport.width,
            pageHeight: baseViewport.height,
            rasterWidth: canvas.width,
            rasterHeight: canvas.height,
          }),
          mimeType,
          quality,
        )
      : await canvas.toBytes(mimeType, quality);

    if (input.region) {
      const validation = validatePdfRegion(input.region, {
        width: baseViewport.width,
        height: baseViewport.height,
      });

      diagnostics.push(...validation);

      if (validation.length === 0) {
        diagnostics.push({
          level: 'info',
          code: 'OCR_REGION_RASTERIZED',
          pageIndex: input.pageIndex,
          message: 'PDF page region was rasterized for OCR.',
        });
      }
    }

    return {
      pageIndex: input.pageIndex,
      pageNumber,
      imageBytes,
      width: input.region?.width ?? baseViewport.width,
      height: input.region?.height ?? baseViewport.height,
      rasterWidth: input.region
        ? Math.floor(input.region.width * scale)
        : canvas.width,
      rasterHeight: input.region
        ? Math.floor(input.region.height * scale)
        : canvas.height,
      scale,
      region: input.region,
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
}): PdfRasterCropRect {
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
    && region.x >= 0
    && region.y >= 0
    && region.x + region.width <= page.width
    && region.y + region.height <= page.height;

  if (!valid) {
    diagnostics.push({
      level: 'warning',
      code: 'OUT_OF_PAGE_BBOX',
      message: 'OCR raster region is outside PDF page bounds.',
    });
  }

  return diagnostics;
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
