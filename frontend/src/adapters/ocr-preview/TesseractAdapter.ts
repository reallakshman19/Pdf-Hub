/*
 * TesseractAdapter (preview mode).
 *
 * This adapter implements a very lightweight wrapper around OCR
 * recognition for preview mode.  Rather than performing real OCR,
 * it returns dummy results with simple text blocks.  The purpose is
 * to allow the UI to function and demonstrate page selection and
 * progress without requiring heavy dependencies or worker threads.
 */

import type {
  LegacyOcrBlock as OcrBlock,
  LegacyOcrPageResult as OcrPageResult,
} from '../../core/ocr/store';
import { warn } from '@/core/logger/service';

export interface RecognizePagesParams {
  documentKey: string;
  pageNumbers: number[];
  language: string;
}

/**
 * Generate a pseudo‑random dummy OCR block for the given page number.
 */
function makeDummyBlock(pageNumber: number): OcrBlock {
  return {
    id: `block-${pageNumber}-${Math.random().toString(36).substr(2, 5)}`,
    type: 'text',
    rect: { x: 50, y: 50, width: 200, height: 20 },
    text: `Sample OCR text on page ${pageNumber}`,
    confidence: 1.0,
    source: 'tesseract',
  };
}

/**
 * Recognize the specified pages.  This function simulates
 * asynchronous OCR by returning a promise that resolves after a
 * short delay with dummy data.  In a real implementation this
 * function would spawn a worker and call Tesseract.js.
 */
export async function recognizePages({
  pageNumbers,
  language,
}: RecognizePagesParams): Promise<OcrPageResult[]> {
  warn('ocr', 'Preview OCR is returning simulated results; Tesseract worker is not wired yet.', {
    pageCount: pageNumbers.length,
    language,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return pageNumbers.map((pageNumber) => {
    const block = makeDummyBlock(pageNumber);
    const result: OcrPageResult = {
      pageNumber,
      status: 'complete',
      language,
      confidence: block.confidence,
      blocks: [block],
      warnings: [],
    };
    return result;
  });
}