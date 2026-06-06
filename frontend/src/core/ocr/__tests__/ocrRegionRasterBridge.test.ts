import { describe, expect, it } from 'vitest';
import type {
  PdfRasterizerDocumentLike,
  PdfRasterizerPageLike,
} from '../pdfPageRasterizer';
import {
  createMemoryPdfRasterCanvasFactory,
} from '../pdfPageRasterizer';
import {
  normalizeFallbackRegionPageInput,
  rasterizeOcrRegionToPageInput,
  resolveOcrRegionPageInput,
} from '../ocrRegionRasterBridge';
import { createOcrRegion } from '../ocrRegionModel';

describe('ocrRegionRasterBridge', () => {
  it('normalizes fallback page input for selected region', () => {
    const region = makeRegion();

    const pageInput = normalizeFallbackRegionPageInput(
      {
        pageIndex: 99,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
      region,
    );

    expect(pageInput.pageIndex).toBe(0);
    expect(pageInput.width).toBe(region.bbox.width);
    expect(pageInput.height).toBe(region.bbox.height);
    expect(pageInput.region).toEqual(region.bbox);
  });

  it('uses fallback input when no pdfBytes/document is supplied', async () => {
    const region = makeRegion();

    const resolved = await resolveOcrRegionPageInput({
      region,
      fallbackPageInput: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
    });

    expect(resolved.source).toBe('fallback');
    expect(resolved.rasterizedPage).toBeNull();
    expect(resolved.pageInput.width).toBe(region.bbox.width);
    expect(resolved.pageInput.height).toBe(region.bbox.height);
    expect(resolved.pageInput.region).toEqual(region.bbox);
    expect(resolved.diagnostics[0].message).toContain('fallback OCR page input');
  });

  it('rasterizes selected region into OCR engine page input', async () => {
    const region = makeRegion();

    const resolved = await rasterizeOcrRegionToPageInput({
      region,
      document: createFakeDocument(),
      scale: 2,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
    });

    expect(resolved.source).toBe('pdf-raster');
    expect(resolved.rasterizedPage).not.toBeNull();
    expect(resolved.pageInput.pageIndex).toBe(region.pageIndex);
    expect(resolved.pageInput.width).toBe(region.bbox.width);
    expect(resolved.pageInput.height).toBe(region.bbox.height);
    expect(resolved.pageInput.region).toEqual(region.bbox);
    expect(new TextDecoder().decode(resolved.pageInput.imageBytes)).toContain('PDFHUB_RASTER');
    expect(resolved.diagnostics.some((item) => item.code === 'OCR_REGION_RASTERIZED')).toBe(true);
  });

  it('uses document raster path when document is supplied through resolver', async () => {
    const region = makeRegion();

    const resolved = await resolveOcrRegionPageInput({
      region,
      document: createFakeDocument(),
      scale: 2,
      canvasFactory: createMemoryPdfRasterCanvasFactory(),
      fallbackPageInput: {
        pageIndex: 0,
        imageBytes: new Uint8Array([9, 9, 9]),
        width: 595,
        height: 842,
      },
    });

    expect(resolved.source).toBe('pdf-raster');
    expect(new TextDecoder().decode(resolved.pageInput.imageBytes)).toContain('PDFHUB_RASTER');
  });

  it('throws when no raster source and no fallback exist', async () => {
    await expect(
      resolveOcrRegionPageInput({
        region: makeRegion(),
      }),
    ).rejects.toThrow('No PDF bytes, PDF document, or fallback page input supplied');
  });
});

function makeRegion() {
  return createOcrRegion({
    id: 'region-raster-1',
    documentFingerprint: 'doc-region-raster',
    pageIndex: 0,
    mode: 'text',
    bbox: {
      x: 60,
      y: 620,
      width: 120,
      height: 80,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}

function createFakeDocument(): PdfRasterizerDocumentLike {
  return {
    numPages: 1,
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
          return {
            promise: Promise.resolve(),
            cancel: () => undefined,
          };
        },
      };
    },
  };
}
