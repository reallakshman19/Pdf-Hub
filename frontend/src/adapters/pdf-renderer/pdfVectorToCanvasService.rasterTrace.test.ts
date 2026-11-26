/**
 * Integration test: Layer 5 raster auto-trace end-to-end path.
 *
 * We mock `PdfRendererAdapter.rasterizePageRegion` to return a synthetic
 * ImageData containing a 1-pixel-wide L-shaped "pipe run" on a white
 * background, then call `portPdfPageVectorsToAnnotations` with
 * `autoTraceRaster: true` and assert that:
 *  - at least 1 `perimeter-takeoff` annotation is returned
 *  - each annotation has `data.importedFromRasterTrace === true`
 *  - `points` contains at least 4 numbers (≥2 vertices)
 *  - `rasterTracePolylines > 0`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

// pdfjs-dist: minimal stubs so the import resolves in jsdom
vi.mock('pdfjs-dist', () => ({
  AnnotationMode: { DISABLE: 0 },
  GlobalWorkerOptions: { workerSrc: '' },
  OPS: {},
  Util: { transform: (_m: number[], v: number[]) => v },
  getDocument: vi.fn(),
}));

// PdfRendererAdapter.extractPageVectors — returns "raster-only" result
vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  return {
    PdfRendererAdapter: {
      extractPageVectors: vi.fn().mockResolvedValue({
        geometry: { lines: [], beziers: [], rectangles: [], paths: [] },
        textAnchors: [],
        layersDetected: [],
        imageXObjectCount: 1,
        isRasterOnlyLikely: true,
        skippedOutOfRegionCount: 0,
      }),
      // rasterizePageRegion is replaced per-test below
      rasterizePageRegion: vi.fn(),
    },
  };
});

// Core logger
vi.mock('@/core/logger/service', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal RGBA `ImageData` with an L-shaped foreground "pipe run"
 * (dark pixels) on a white background.  The result is large enough for
 * Zhang-Suen thinning to produce a 1-pixel skeleton.
 */
function makeLShapeImageData(): ImageData {
  const W = 60;
  const H = 60;
  const data = new Uint8ClampedArray(W * H * 4);

  // Fill white
  for (let i = 0; i < W * H * 4; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }

  // Draw a 3-pixel-wide vertical arm from (8,5) to (8,40)
  for (let y = 5; y <= 40; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = 8 + dx;
      const base = (y * W + x) * 4;
      data[base] = 0; data[base + 1] = 0; data[base + 2] = 0; data[base + 3] = 255;
    }
  }

  // Draw a 3-pixel-wide horizontal arm from (8,40) to (45,40)
  for (let x = 8; x <= 45; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      const y = 40 + dy;
      const base = (y * W + x) * 4;
      data[base] = 0; data[base + 1] = 0; data[base + 2] = 0; data[base + 3] = 255;
    }
  }

  return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('portPdfPageVectorsToAnnotations — autoTraceRaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces perimeter-takeoff annotations from a synthetic raster L-shape', async () => {
    const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    vi.mocked(PdfRendererAdapter.rasterizePageRegion).mockResolvedValue(makeLShapeImageData());

    // Minimal stub PDFPageProxy — only the methods our code calls
    const fakePage = {
      pageNumber: 1,
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
        transform: [scale, 0, 0, -scale, 0, 792 * scale],
      }),
    };

    const { portPdfPageVectorsToAnnotations } = await import(
      '@/adapters/pdf-renderer/pdfVectorToCanvasService'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await portPdfPageVectorsToAnnotations(fakePage as any, {
      mode: 'pipe',
      autoTraceRaster: true,
      rasterVectorize: { method: 'otsu', minLengthPx: 5 },
    });

    // Should have produced at least one traced annotation
    expect(result.rasterTracePolylines).toBeGreaterThan(0);
    expect(result.annotations.length).toBeGreaterThan(0);

    const traced = result.annotations.filter(
      (a) => a.data.importedFromRasterTrace === true,
    );
    expect(traced.length).toBeGreaterThan(0);

    // Every traced annotation should be a perimeter-takeoff with ≥4 point values
    for (const ann of traced) {
      expect(ann.type).toBe('perimeter-takeoff');
      expect(Array.isArray(ann.data.points)).toBe(true);
      expect((ann.data.points as number[]).length).toBeGreaterThanOrEqual(4);
      expect(ann.data.isPipeRun).toBe(true);
      expect(ann.data.coordinateSpace).toBe('page');
    }
  });

  it('gracefully returns empty annotations when rasterizePageRegion throws', async () => {
    const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    vi.mocked(PdfRendererAdapter.rasterizePageRegion).mockRejectedValue(
      new Error('OffscreenCanvas unavailable'),
    );

    const fakePage = {
      pageNumber: 2,
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
        transform: [scale, 0, 0, -scale, 0, 792 * scale],
      }),
    };

    const { portPdfPageVectorsToAnnotations } = await import(
      '@/adapters/pdf-renderer/pdfVectorToCanvasService'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await portPdfPageVectorsToAnnotations(fakePage as any, {
      autoTraceRaster: true,
    });

    // Should not throw; rasterTracePolylines stays 0
    expect(result.rasterTracePolylines).toBe(0);
    expect(result.isRasterOnlyLikely).toBe(true);
  });

  it('skips raster-trace when autoTraceRaster is false (default)', async () => {
    const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');

    const fakePage = {
      pageNumber: 3,
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
        transform: [scale, 0, 0, -scale, 0, 792 * scale],
      }),
    };

    const { portPdfPageVectorsToAnnotations } = await import(
      '@/adapters/pdf-renderer/pdfVectorToCanvasService'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await portPdfPageVectorsToAnnotations(fakePage as any);

    expect(result.rasterTracePolylines).toBe(0);
    // rasterizePageRegion must NOT have been called
    expect(vi.mocked(PdfRendererAdapter.rasterizePageRegion)).not.toHaveBeenCalled();
  });
});
