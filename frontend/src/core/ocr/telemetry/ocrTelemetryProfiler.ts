/**
 * Real-Time OCR Telemetry & Memory Profiler.
 *
 * Provides high-precision execution timing breakdowns across pipeline stages
 * (rasterization, Tesseract worker, table detection, form intelligence),
 * RGBA canvas buffer memory estimations, and throughput statistics (pages/min).
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain types, no console.log.
 */

export interface OcrPageTelemetryRecord {
  pageIndex: number;
  rasterizeDurationMs: number;
  tesseractExecutionMs: number;
  tableDetectionDurationMs: number;
  formIntelligenceDurationMs: number;
  totalPageDurationMs: number;
  canvasMemoryBytes: number;
  wordCount: number;
  lineCount: number;
}

export interface OcrDocumentTelemetrySummary {
  totalPagesProcessed: number;
  totalDurationMs: number;
  averagePageDurationMs: number;
  pagesPerMinute: number;
  peakCanvasMemoryMb: number;
  totalWordsDetected: number;
  stageBreakdown: {
    rasterizePercent: number;
    tesseractPercent: number;
    tablesPercent: number;
    formsPercent: number;
  };
  dominantBottleneck: 'rasterize' | 'tesseract' | 'tables' | 'forms';
}

/**
 * Calculates estimated RGBA canvas buffer memory in bytes for a rendered page at given DPI.
 * Standard PDF user space is 72 pt per inch.
 */
export function estimateCanvasBufferMemoryBytes(
  widthPt: number,
  heightPt: number,
  dpi: number = 300,
): number {
  const scale = dpi / 72;
  const pixelWidth = Math.round(widthPt * scale);
  const pixelHeight = Math.round(heightPt * scale);
  // 4 bytes per pixel (RGBA 8-bit unsigned clamped array)
  return pixelWidth * pixelHeight * 4;
}

/**
 * Aggregates a sequence of page telemetry records into document-level summary metrics.
 */
export function aggregateDocumentTelemetry(
  records: OcrPageTelemetryRecord[],
): OcrDocumentTelemetrySummary {
  if (records.length === 0) {
    return {
      totalPagesProcessed: 0,
      totalDurationMs: 0,
      averagePageDurationMs: 0,
      pagesPerMinute: 0,
      peakCanvasMemoryMb: 0,
      totalWordsDetected: 0,
      stageBreakdown: {
        rasterizePercent: 0,
        tesseractPercent: 0,
        tablesPercent: 0,
        formsPercent: 0,
      },
      dominantBottleneck: 'tesseract',
    };
  }

  let totalDurationMs = 0;
  let totalRasterMs = 0;
  let totalTesseractMs = 0;
  let totalTablesMs = 0;
  let totalFormsMs = 0;
  let peakMemoryBytes = 0;
  let totalWords = 0;

  for (const r of records) {
    totalDurationMs += r.totalPageDurationMs;
    totalRasterMs += r.rasterizeDurationMs;
    totalTesseractMs += r.tesseractExecutionMs;
    totalTablesMs += r.tableDetectionDurationMs;
    totalFormsMs += r.formIntelligenceDurationMs;
    peakMemoryBytes = Math.max(peakMemoryBytes, r.canvasMemoryBytes);
    totalWords += r.wordCount;
  }

  const N = records.length;
  const avgPageDuration = totalDurationMs / N;
  const pagesPerMin = totalDurationMs > 0 ? Number(((N / (totalDurationMs / 1000)) * 60).toFixed(1)) : 0;
  const peakMemoryMb = Number((peakMemoryBytes / (1024 * 1024)).toFixed(2));

  const totalStageSum = Math.max(1, totalRasterMs + totalTesseractMs + totalTablesMs + totalFormsMs);

  const rasterPercent = Math.round((totalRasterMs / totalStageSum) * 100);
  const tessPercent = Math.round((totalTesseractMs / totalStageSum) * 100);
  const tblPercent = Math.round((totalTablesMs / totalStageSum) * 100);
  const formPercent = Math.round((totalFormsMs / totalStageSum) * 100);

  // Determine dominant bottleneck
  let bottleneck: 'rasterize' | 'tesseract' | 'tables' | 'forms' = 'tesseract';
  let maxDuration = totalTesseractMs;

  if (totalRasterMs > maxDuration) {
    maxDuration = totalRasterMs;
    bottleneck = 'rasterize';
  }
  if (totalTablesMs > maxDuration) {
    maxDuration = totalTablesMs;
    bottleneck = 'tables';
  }
  if (totalFormsMs > maxDuration) {
    bottleneck = 'forms';
  }

  return {
    totalPagesProcessed: N,
    totalDurationMs,
    averagePageDurationMs: Math.round(avgPageDuration),
    pagesPerMinute: pagesPerMin,
    peakCanvasMemoryMb: peakMemoryMb,
    totalWordsDetected: totalWords,
    stageBreakdown: {
      rasterizePercent: rasterPercent,
      tesseractPercent: tessPercent,
      tablesPercent: tblPercent,
      formsPercent: formPercent,
    },
    dominantBottleneck: bottleneck,
  };
}
