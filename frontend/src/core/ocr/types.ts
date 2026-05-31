/*
 * OCR type definitions.
 *
 * These types define the data structures used for client‑side OCR jobs
 * and results in preview mode. They mirror a simplified subset of the
 * server specification, keeping enough information to display progress
 * and overlay results on the PDF.  No server calls are made.
 */

export type OcrStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'equation-failed'
  | 'low-confidence'
  | 'cancelled'
  | 'timeout'
  | 'failed';

/**
 * A rectangular region on a page. Coordinates are relative to the
 * unscaled PDF coordinate system (0,0 is top left). Width and height
 * represent the size of the region in points.
 */
export interface OcrRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A single OCR block describes either a text run or an equation
 * extracted from the page.  Each block has a bounding box and a
 * confidence score between 0 and 1.  The `source` field indicates
 * whether the block originated from native PDF text, Tesseract or
 * another engine.
 */
export interface OcrBlock {
  id: string;
  type: 'text' | 'equation';
  rect: OcrRect;
  text?: string;
  latex?: string;
  confidence: number;
  source: 'native-text' | 'tesseract' | 'pix2tex' | 'manual';
}

/**
 * An OCR result for a single page.  Each page result includes its
 * page number, current status, the language used for recognition,
 * the average confidence, and a list of blocks.  Warnings may be
 * populated if low confidence or other issues were encountered.
 */
export interface OcrPageResult {
  pageNumber: number;
  status: OcrStatus;
  language: string;
  confidence: number;
  blocks: OcrBlock[];
  warnings: string[];
}

/**
 * A running OCR job tracks progress across multiple pages.  The
 * `queuedAt` timestamp records when the job was created.  Jobs are
 * identified by a unique ID and can be cancelled by the user.
 */
export interface OcrJob {
  id: string;
  documentKey: string;
  pageNumbers: number[];
  status: OcrStatus;
  results: OcrPageResult[];
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  cancelled: boolean;
}

/**
 * Aggregate OCR results keyed by page number.  This structure makes it
 * easy to query results for overlays and search providers.  It is
 * separate from the job to allow multiple jobs to update the same
 * page results over time.
 */
export interface OcrResultsByPage {
  [pageNumber: number]: OcrPageResult;
}