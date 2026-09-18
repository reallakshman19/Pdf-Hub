import type { PdfRect } from '../writer-v2/types';
import type { PageId } from '../pages/types';
import type { OcrJob } from './ocrJobTypes';

export type { OcrJob };

export type OcrPageType =
  | 'bornDigital'
  | 'scanned'
  | 'mixed'
  | 'imageHeavy'
  | 'tableHeavy'
  | 'formHeavy'
  | 'engineeringDrawing'
  | 'unknown';

export type OcrBlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'table'
  | 'figure'
  | 'caption'
  | 'formField'
  | 'stamp'
  | 'titleBlock'
  | 'revisionTable'
  | 'text'
  | 'equation'
  | 'unknown';

export type OcrPageStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'complete'
  | 'running'
  | 'queued';

export type OcrDiagnosticLevel =
  | 'info'
  | 'warning'
  | 'error';

export type OcrDiagnosticCode =
  | 'PAGE_SKIPPED_BORN_DIGITAL'
  | 'LOW_CONFIDENCE_WORDS'
  | 'OCR_ENGINE_FAILED'
  | 'OUT_OF_PAGE_BBOX'
  | 'EMPTY_TEXT'
  | 'TABLE_EXTRACTION_PARTIAL'
  | 'UNSUPPORTED_LANGUAGE'
  | 'CORRECTION_APPLIED'
  | 'INVALID_OCR_RESULT'
  | 'MOCK_ENGINE_USED'
  | 'OCR_REGION_RASTERIZED'
  // Final integration codes
  | 'OCR_FINAL_EXECUTION_PLAN_READY'
  | 'OCR_FINAL_EXECUTION_PLAN_FAILED'
  | 'OCR_FINAL_BATCH_PLAN_READY'
  | 'OCR_FINAL_BATCH_RUN_STARTED'
  | 'OCR_FINAL_BATCH_RUN_COMPLETED'
  | 'OCR_FINAL_RESULT_MERGED'
  | 'OCR_FINAL_NO_RESULTS'
  | 'OCR_FINAL_CANCELLED'
  // Pipeline mode codes
  | 'OCR_PIPELINE_MODE_READY'
  | 'OCR_PIPELINE_WORKER_UNAVAILABLE'
  | 'OCR_PIPELINE_RASTER_WORKER_UNAVAILABLE'
  | 'OCR_PIPELINE_FALLBACK_TO_MAIN'
  // Pipeline batch planning codes
  | 'OCR_PIPELINE_BATCH_READY'
  | 'OCR_PIPELINE_BATCH_EMPTY'
  | 'OCR_PIPELINE_EXPLICIT_PAGES_USED'
  | 'OCR_PIPELINE_PLACEHOLDER_PAGES_USED'
  | 'OCR_PIPELINE_MAIN_RASTER_USED'
  | 'OCR_PIPELINE_WORKER_RASTER_USED'
  | 'OCR_PIPELINE_BATCH_SIZE_NORMALIZED';

export interface OcrDiagnostic {
  level: OcrDiagnosticLevel;
  pageId?: PageId;
  code: OcrDiagnosticCode;
  message: string;
  pageIndex?: number;
  targetId?: string;
}

export interface OcrWord {
  id: string;
  pageId?: PageId;
  pageIndex: number;
  text: string;
  normalizedText: string;
  confidence: number;
  bbox: PdfRect;
  lineId?: string;
  blockId?: string;
}

export interface OcrLine {
  id: string;
  pageId?: PageId;
  pageIndex: number;
  text: string;
  confidence: number;
  bbox: PdfRect;
  wordIds: string[];
  blockId?: string;
  
  // Compatibility field:
  rect?: PdfRect;
}

export interface OcrBaseBlock {
  id: string;
  pageId?: PageId;
  pageIndex?: number;
  bbox?: PdfRect;
  text?: string;
  confidence?: number;
  lineIds?: string[];
  wordIds?: string[];
  rows?: OcrTableRow[];

  // Compatibility fields:
  rect: PdfRect;
  latex?: string;
  source?: string;
}

export interface OcrBlock extends OcrBaseBlock {
  type: OcrBlockType;
}

export interface OcrTableBlock extends OcrBaseBlock {
  type: 'table';
  rows: OcrTableRow[];
}

export interface OcrTableRow {
  id: string;
  cells: OcrTableCell[];
}

export interface OcrTableCell {
  id: string;
  text: string;
  confidence: number;
  bbox: PdfRect;
  rowSpan?: number;
  colSpan?: number;
}

export type OcrAnyBlock = OcrBlock | OcrTableBlock;

export interface OcrPageResult {
  status: OcrPageStatus;
  /** Canonical PDF page identity; optional for legacy/engine output. */
  pageId?: PageId;
  /** Zero-based execution/render coordinate derived from PageGraph. */
  pageIndex?: number;
  pageType?: OcrPageType;
  orientationDeg?: number;
  languageHints?: string[];
  width?: number;
  height?: number;
  words?: OcrWord[];
  lines?: OcrLine[];
  blocks: OcrAnyBlock[];
  diagnostics?: OcrDiagnostic[];

  // Compatibility fields:
  pageNumber: number;
  language?: string;
  warnings?: string[];
  confidence?: number;
}

export interface OcrReviewFocus {
  documentFingerprint: string;
  pageId?: PageId;
  pageIndex: number;
  bbox: PdfRect;
  targetId: string;
  source: 'lowConfidence' | 'search' | 'region';
  label?: string;
  requestedAt: number;
}

export interface OcrDocumentResult {
  documentFingerprint: string;
  createdAt: string;
  engineId: string;
  profileId: string;
  pages: OcrPageResult[];
  diagnostics: OcrDiagnostic[];
}

export interface OcrValidationResult {
  valid: boolean;
  diagnostics: OcrDiagnostic[];
}

// Compatibility types:
export type OcrStatus = OcrPageStatus;
export interface OcrRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OcrResultsByPage {
  [pageNumber: number]: OcrPageResult;
}

export function normalizeOcrText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function clampOcrConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function isRectInsidePage(
  rect: PdfRect,
  page: { width?: number; height?: number },
): boolean {
  const w = page.width ?? 0;
  const h = page.height ?? 0;
  return rect.x >= 0
    && rect.y >= 0
    && rect.width >= 0
    && rect.height >= 0
    && rect.x + rect.width <= w
    && rect.y + rect.height <= h;
}

export function validateOcrPageResult(
  page: OcrPageResult,
): OcrValidationResult {
  const diagnostics: OcrDiagnostic[] = [];
  const width = page.width ?? 0;
  const height = page.height ?? 0;

  if (width <= 0 || height <= 0) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: page.pageIndex,
      message: 'OCR page result has invalid page dimensions.',
    });
  }

  const words = page.words ?? [];
  const lines = page.lines ?? [];
  const blocks = page.blocks;

  for (const word of words) {
    if (!word.id) {
      diagnostics.push({
        level: 'error',
        code: 'INVALID_OCR_RESULT',
        pageIndex: page.pageIndex,
        message: 'OCR word has missing id.',
      });
    }

    if (!word.text.trim()) {
      diagnostics.push({
        level: 'warning',
        code: 'EMPTY_TEXT',
        pageIndex: page.pageIndex,
        targetId: word.id,
        message: 'OCR word has empty text.',
      });
    }

    if (word.confidence < 0 || word.confidence > 1) {
      diagnostics.push({
        level: 'error',
        code: 'INVALID_OCR_RESULT',
        pageIndex: page.pageIndex,
        targetId: word.id,
        message: 'OCR word confidence is outside 0–1 range.',
      });
    }

    if (!isRectInsidePage(word.bbox, page)) {
      diagnostics.push({
        level: 'error',
        code: 'OUT_OF_PAGE_BBOX',
        pageIndex: page.pageIndex,
        targetId: word.id,
        message: 'OCR word bbox is outside page bounds.',
      });
    }
  }

  for (const line of lines) {
    if (!isRectInsidePage(line.bbox, page)) {
      diagnostics.push({
        level: 'error',
        code: 'OUT_OF_PAGE_BBOX',
        pageIndex: page.pageIndex,
        targetId: line.id,
        message: 'OCR line bbox is outside page bounds.',
      });
    }
  }

  for (const block of blocks) {
    if (block.bbox && !isRectInsidePage(block.bbox, page)) {
      diagnostics.push({
        level: 'error',
        code: 'OUT_OF_PAGE_BBOX',
        pageIndex: page.pageIndex,
        targetId: block.id,
        message: 'OCR block bbox is outside page bounds.',
      });
    }
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}

export function validateOcrDocumentResult(
  document: OcrDocumentResult,
): OcrValidationResult {
  const diagnostics = document.pages.flatMap((page) =>
    validateOcrPageResult(page).diagnostics,
  );

  if (!document.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      message: 'OCR document result has missing documentFingerprint.',
    });
  }

  if (!document.engineId) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      message: 'OCR document result has missing engineId.',
    });
  }

  if (!document.profileId) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      message: 'OCR document result has missing profileId.',
    });
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}