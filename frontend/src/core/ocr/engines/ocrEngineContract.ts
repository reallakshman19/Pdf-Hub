import type { PdfRect } from '../../writer-v2/types';
import type { OcrDocumentResult } from '../types';
import type { OcrProfile } from '../ocrProfiles';

export interface OcrEnginePageInput {
  pageIndex: number;
  imageBytes: Uint8Array;
  width: number;
  height: number;

  /**
   * Optional region in PDF/page coordinates.
   * When omitted, engine should OCR the full page image.
   */
  region?: PdfRect;

  /** Actual OCR image pixel width/height, distinct from PDF-point dimensions. */
  rasterWidth?: number;
  rasterHeight?: number;

  /**
   * Affine transform from OCR image pixel coordinates (top-left origin)
   * to the original PDF user space: [a, b, c, d, e, f].
   *
   * pdfX = a * pixelX + c * pixelY + e
   * pdfY = b * pixelX + d * pixelY + f
   */
  pixelToPdfTransform?: readonly [number, number, number, number, number, number];
}

export interface OcrEngineInput {
  documentFingerprint: string;
  pages: OcrEnginePageInput[];
  profile: OcrProfile;
  abortSignal?: AbortSignal;
}

export interface OcrEngine {
  id: string;
  label: string;
  supportsTables: boolean;
  supportsLayout: boolean;
  supportsSearchablePdf: boolean;
  recognize(input: OcrEngineInput): Promise<OcrDocumentResult>;
}

export interface OcrEngineRegistry {
  getEngine(engineId: string): OcrEngine | null;
  listEngines(): OcrEngine[];
}
