import { describe, expect, it } from 'vitest';
import type {
  PdfRasterizerDocumentLike,
  PdfRasterizerPageLike,
} from '../pdfPageRasterizer';
import {
  createMemoryPdfRasterCanvasFactory,
  pdfRectToRasterCropRect,
  rasterizePdfPageForOcr,
  rasterizePdfPagesForOcr,
  rasterizedPdfPageToOcrEnginePageInput,
  rasterizedPdfPagesToOcrEnginePageInputs,
} from '../pdfPageRasterizer';

describe('pdfPageRasterizer', () => {
  it('maps PDF rect to raster crop rect', () => {
    const crop = pdfRectToRasterCropRect({
      rect: {
        x: 100,
        y: 200,
        width: 50,
        height: 20,
      },
      pageWidth: 500,
      pageHeight: 1000,
      rasterWidth: 250,
      rasterHeight: 500,
    });

    expect(crop).toEqual({
      x: 50,
      y: 390,
      width: 25,
      height: 10,
    });
  });

  it('clamps crop rect to raster bounds', () => {
    const crop = pdfRectToRasterCropRect({
      rect: {
        x: 490,
        y: 990,
        width: 50,
        height: 50,
      },
      pageWidth: 500,
      pageHeight: 1000,
      rasterWidth: 250,
      rasterHeight: 500,
    });

    expect(crop.x).toBe(245);
    expect(crop.y).toBe(0);
    expect(crop.width).toBeGreaterThanOrEqual(1);
    expect(crop.height).toBeGreaterThanOrEqual(1);
  });

  it('rasterizes a single PDF page using fake document and memory canvas', async () => {
    const renderedPages: number[] = [];

    const document = createFakeDocument({
      onRender: (pageNumber) => {
        renderedPages.push(pageNumber);
      },
    });

    const page = await rasterizePdfPageForOcr({
      document,
      pageIndex: 0,
      scale: 2,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(renderedPages).toEqual([1]);
    expect(page.pageIndex).toBe(0);
    expect(page.pageNumber).toBe(1);
    expect(page.width).toBe(595);
    expect(page.height).toBe(842);
    expect(page.rasterWidth).toBe(1190);
    expect(page.rasterHeight).toBe(1684);
    expect(page.imageBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(page.imageBytes)).toContain('PDFHUB_RASTER:1190x1684');
  });

  it('uses PDF.js rotation and displaced CropBox for the OCR crop and inverse transform', async () => {
    const document: PdfRasterizerDocumentLike = {
      numPages: 1,
      async getPage(pageNumber) {
        return {
          pageNumber,
          view: [70, 100, 540, 720],
          getViewport({ scale }) {
            return {
              width: 620 * scale,
              height: 470 * scale,
              convertToViewportRectangle([x0, y0, x1, y1]) {
                return [
                  (y0 - 100) * scale, (x0 - 70) * scale,
                  (y1 - 100) * scale, (x1 - 70) * scale,
                ];
              },
              convertToPdfPoint(x, y) {
                return [70 + y / scale, 100 + x / scale];
              },
            };
          },
          render() {
            return { promise: Promise.resolve() };
          },
        };
      },
    };
    const page = await rasterizePdfPageForOcr({
      document,
      pageIndex: 0,
      scale: 2,
      region: { x: 80, y: 145, width: 20, height: 50 },
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });
    expect([page.rasterWidth, page.rasterHeight]).toEqual([100, 40]);
    const m = page.pixelToPdfTransform!;
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(0.5);
    expect(m[2]).toBeCloseTo(0.5);
    expect(m[3]).toBeCloseTo(0);
    expect(m[4]).toBeCloseTo(80);
    expect(m[5]).toBeCloseTo(145);
    const pageInput = rasterizedPdfPageToOcrEnginePageInput(page);
    expect(pageInput.pixelToPdfTransform).toEqual(page.pixelToPdfTransform);
    expect(new TextDecoder().decode(page.imageBytes)).toContain('PDFHUB_RASTER:100x40');

    await expect(rasterizePdfPageForOcr({
      document,
      pageIndex: 0,
      region: { x: 0, y: 145, width: 20, height: 50 },
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    })).rejects.toThrow('outside PDF page bounds');
  });

  it('refuses to rasterize after its job has been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(rasterizePdfPageForOcr({
      document: createFakeDocument(),
      pageIndex: 0,
      signal: controller.signal,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    })).rejects.toThrow();
  });

  it('rasterizes multiple selected pages in normalized order', async () => {
    const document = createFakeDocument();

    const result = await rasterizePdfPagesForOcr({
      document,
      pageIndexes: [2, 0, 2, 1],
      scale: 1,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(result.pages.map((page) => page.pageIndex)).toEqual([0, 1, 2]);
    expect(result.pages).toHaveLength(3);
  });

  it('rasterizes a PDF region as cropped image bytes', async () => {
    const document = createFakeDocument();

    const page = await rasterizePdfPageForOcr({
      document,
      pageIndex: 0,
      scale: 2,
      region: {
        x: 60,
        y: 620,
        width: 120,
        height: 80,
      },
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(page.region).toEqual({
      x: 60,
      y: 620,
      width: 120,
      height: 80,
    });
    expect(page.width).toBe(120);
    expect(page.height).toBe(80);
    expect(page.rasterWidth).toBe(240);
    expect(page.rasterHeight).toBe(160);
    expect(new TextDecoder().decode(page.imageBytes)).toContain('PDFHUB_RASTER:240x160');
    expect(page.diagnostics.some((item) => item.code === 'OCR_REGION_RASTERIZED')).toBe(true);
  });

  it('returns error diagnostic for page outside range', async () => {
    const page = await rasterizePdfPageForOcr({
      document: createFakeDocument({
        numPages: 1,
      }),
      pageIndex: 5,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(page.imageBytes).toHaveLength(0);
    expect(page.diagnostics[0].level).toBe('error');
    expect(page.diagnostics[0].message).toContain('outside document page range');
  });

  it('clamps raster scale when maxCanvasPixels would be exceeded', async () => {
    const page = await rasterizePdfPageForOcr({
      document: createFakeDocument(),
      pageIndex: 0,
      scale: 10,
      maxCanvasPixels: 595 * 842,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(page.scale).toBeLessThan(10);
    expect(page.rasterWidth * page.rasterHeight).toBeLessThanOrEqual(595 * 842 + 595);
  });

  it('converts rasterized page to OcrEnginePageInput', async () => {
    const page = await rasterizePdfPageForOcr({
      document: createFakeDocument(),
      pageIndex: 0,
      region: {
        x: 60,
        y: 620,
        width: 120,
        height: 80,
      },
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    const engineInput = rasterizedPdfPageToOcrEnginePageInput(page);

    expect(engineInput.pageIndex).toBe(0);
    expect(engineInput.imageBytes.length).toBeGreaterThan(0);
    expect(engineInput.width).toBe(120);
    expect(engineInput.height).toBe(80);
    expect(engineInput.region).toEqual(page.region);
  });

  it('converts multiple rasterized pages to OCR engine inputs', async () => {
    const result = await rasterizePdfPagesForOcr({
      document: createFakeDocument(),
      pageIndexes: [0, 1],
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    const engineInputs = rasterizedPdfPagesToOcrEnginePageInputs(result.pages);

    expect(engineInputs).toHaveLength(2);
    expect(engineInputs[0].pageIndex).toBe(0);
    expect(engineInputs[1].pageIndex).toBe(1);
  });
});

function createFakeDocument(input: {
  numPages?: number;
  onRender?: (pageNumber: number) => void;
} = {}): PdfRasterizerDocumentLike {
  const numPages = input.numPages ?? 3;

  return {
    numPages,
    async getPage(pageNumber: number): Promise<PdfRasterizerPageLike> {
      return {
        pageNumber,
        getViewport({ scale }) {
          return {
            width: 595 * scale,
            height: 842 * scale,
          };
        },
        render() {
          input.onRender?.(pageNumber);

          return {
            promise: Promise.resolve(),
            cancel: () => undefined,
          };
        },
      };
    },
    async destroy() {
      return undefined;
    },
  };
}
