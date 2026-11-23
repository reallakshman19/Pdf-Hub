/**
 * OCR-to-Native Vector Text Reconciliation Domain Types.
 * Pure TypeScript (INV-4 compliant).
 */

export interface OcrTextReconciliationIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageIndex: number;
  pageId: string;
  ocrBlockId: string;
  ocrLineIndices: number[];
  originalOcrText: string;
  editedText: string;
  targetBoundsPt: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fontSizePt: number;
  fontFamily?: string;
  colorHex?: string;
  backgroundColorHex?: string;
}

export interface OcrTextReconciliationResult {
  success: boolean;
  pageIndex: number;
  bytesModified: boolean;
  rasterInpainted: boolean;
  vectorTextSynthesized: boolean;
  synthesizedSpanId: string;
  details: {
    whiteoutRectPt: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    textEmitted: string;
    fontSizePt: number;
    backgroundColorHex?: string;
  };
}
