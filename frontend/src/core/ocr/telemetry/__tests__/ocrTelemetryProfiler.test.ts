import { describe, it, expect } from 'vitest';
import {
  estimateCanvasBufferMemoryBytes,
  aggregateDocumentTelemetry,
  type OcrPageTelemetryRecord,
} from '../ocrTelemetryProfiler';

describe('ocrTelemetryProfiler', () => {
  it('estimates RGBA canvas buffer memory accurately', () => {
    // Standard US Letter is 612 x 792 pt. At 72 DPI = 612 x 792 pixels * 4 bytes = 1,938,816 bytes (~1.85 MB)
    const mem72 = estimateCanvasBufferMemoryBytes(612, 792, 72);
    expect(mem72).toBe(612 * 792 * 4);

    // At 300 DPI, scale = 300/72 = 4.1667. Pixel width = 2550, height = 3300.
    // 2550 * 3300 * 4 = 33,660,000 bytes (~32.1 MB)
    const mem300 = estimateCanvasBufferMemoryBytes(612, 792, 300);
    expect(mem300).toBe(2550 * 3300 * 4);
    expect(mem300).toBeGreaterThan(30 * 1024 * 1024);
  });

  it('aggregates document telemetry metrics across pages', () => {
    const records: OcrPageTelemetryRecord[] = [
      {
        pageIndex: 0,
        rasterizeDurationMs: 120,
        tesseractExecutionMs: 450,
        tableDetectionDurationMs: 30,
        formIntelligenceDurationMs: 25,
        totalPageDurationMs: 625,
        canvasMemoryBytes: 33660000,
        wordCount: 150,
        lineCount: 22,
      },
      {
        pageIndex: 1,
        rasterizeDurationMs: 140,
        tesseractExecutionMs: 500,
        tableDetectionDurationMs: 40,
        formIntelligenceDurationMs: 30,
        totalPageDurationMs: 710,
        canvasMemoryBytes: 33660000,
        wordCount: 180,
        lineCount: 28,
      },
    ];

    const summary = aggregateDocumentTelemetry(records);

    expect(summary.totalPagesProcessed).toBe(2);
    expect(summary.totalDurationMs).toBe(1335);
    expect(summary.averagePageDurationMs).toBe(668); // 1335 / 2 = 667.5 rounded = 668
    expect(summary.totalWordsDetected).toBe(330);
    expect(summary.peakCanvasMemoryMb).toBeCloseTo(32.1, 1);
    expect(summary.dominantBottleneck).toBe('tesseract');
    expect(summary.stageBreakdown.tesseractPercent).toBeGreaterThan(60);
    expect(summary.pagesPerMinute).toBeGreaterThan(80);
  });

  it('handles empty telemetry records gracefully', () => {
    const summary = aggregateDocumentTelemetry([]);
    expect(summary.totalPagesProcessed).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
    expect(summary.pagesPerMinute).toBe(0);
    expect(summary.peakCanvasMemoryMb).toBe(0);
  });
});
