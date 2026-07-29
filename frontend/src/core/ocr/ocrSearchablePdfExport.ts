import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type { PdfRect } from '../writer-v2/types';
import type {
  OcrDocumentResult,
  OcrPageResult,
} from './types';
import type { OcrCorrection } from './ocrCorrections';
import {
  applyOcrCorrectionsToDocument,
} from './ocrCorrections';

export interface OcrSearchablePdfExportInput {
  pdfBytes: Uint8Array;
  ocrResult: OcrDocumentResult;
  corrections?: OcrCorrection[];

  /**
   * Default: true.
   * When true, correction text is applied before embedding OCR text.
   */
  useCorrections?: boolean;

  /**
   * Default: 0.
   * Words below this confidence are skipped.
   */
  minConfidence?: number;

  /**
   * Default: word.
   * Word layer is better for search hit positions.
   * Line layer is smaller and cleaner if OCR word boxes are noisy.
   */
  layerMode?: 'word' | 'line';

  /**
   * Default: invisible.
   * debug-visible is for QA only.
   */
  visibilityMode?: 'invisible' | 'debug-visible';

  /**
   * Default: 0.
   * Some PDF viewers may ignore fully transparent glyphs.
   * For production, 0 is preferred. If search indexing fails in a target viewer,
   * try 0.01.
   */
  invisibleOpacity?: number;

  /**
   * Default: true.
   * If true, saves without object streams so certification can inspect content
   * more easily.
   */
  disableObjectStreams?: boolean;
}

export interface OcrSearchablePdfExportResult {
  bytes: Uint8Array;
  pageCount: number;
  embeddedTextItemCount: number;
  skippedTextItemCount: number;
  diagnostics: OcrSearchablePdfDiagnostic[];
}

export interface OcrSearchablePdfDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_TEXT_LAYER_ADDED'
    | 'OCR_PAGE_NOT_FOUND'
    | 'PDF_PAGE_NOT_FOUND'
    | 'OCR_ITEM_SKIPPED_EMPTY_TEXT'
    | 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE'
    | 'OCR_ITEM_SKIPPED_INVALID_BBOX'
    | 'OCR_PAGE_SIZE_SCALED'
    | 'NO_OCR_TEXT_EMBEDDED';
  message: string;
  pageIndex?: number;
  targetId?: string;
}

interface DrawOcrTextContext {
  page: import('pdf-lib').PDFPage;
  font: import('pdf-lib').PDFFont;
  rgb: typeof import('pdf-lib').rgb;
  pageSize: {
    width: number;
    height: number;
  };
  ocrPageSize: {
    width: number;
    height: number;
  };
  visibilityMode: 'invisible' | 'debug-visible';
  invisibleOpacity: number;
}

interface OcrTextItem {
  id: string;
  pageIndex: number;
  text: string;
  confidence: number;
  bbox: PdfRect;
}

export async function exportSearchableOcrPdf(
  input: OcrSearchablePdfExportInput,
): Promise<OcrSearchablePdfExportResult> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const doc = await PDFDocument.load(input.pdfBytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const ocrDocument = input.useCorrections === false
    ? input.ocrResult
    : applyOcrCorrectionsToDocument(
        input.ocrResult,
        input.corrections ?? [],
      );

  const minConfidence = input.minConfidence ?? 0;
  const layerMode = input.layerMode ?? 'word';
  const visibilityMode = input.visibilityMode ?? 'invisible';
  const invisibleOpacity = input.invisibleOpacity ?? 0;

  const diagnostics: OcrSearchablePdfDiagnostic[] = [];
  let embeddedTextItemCount = 0;
  let skippedTextItemCount = 0;

  for (const ocrPage of ocrDocument.pages) {
    const pageIndex = ocrPage.pageIndex ?? (ocrPage.pageNumber - 1);
    const page = pages[pageIndex];

    if (!page) {
      diagnostics.push({
        level: 'warning',
        code: 'PDF_PAGE_NOT_FOUND',
        pageIndex,
        message: `PDF page not found for OCR pageIndex ${pageIndex}.`,
      });
      continue;
    }

    const pageSize = page.getSize();
    const ocrPageWidth = ocrPage.width ?? pageSize.width;
    const ocrPageHeight = ocrPage.height ?? pageSize.height;

    if (
      Math.round(pageSize.width) !== Math.round(ocrPageWidth)
      || Math.round(pageSize.height) !== Math.round(ocrPageHeight)
    ) {
      diagnostics.push({
        level: 'info',
        code: 'OCR_PAGE_SIZE_SCALED',
        pageIndex,
        message: `OCR page size ${ocrPageWidth}×${ocrPageHeight} scaled to PDF page size ${pageSize.width}×${pageSize.height}.`,
      });
    }

    const context: DrawOcrTextContext = {
      page,
      font,
      rgb,
      pageSize,
      ocrPageSize: {
        width: ocrPageWidth,
        height: ocrPageHeight,
      },
      visibilityMode,
      invisibleOpacity,
    };

    const items = layerMode === 'line'
      ? ocrLinesToTextItems(ocrPage)
      : ocrWordsToTextItems(ocrPage);

    for (const item of items) {
      const skipReason = getOcrTextItemSkipDiagnostic(
        item,
        minConfidence,
      );

      if (skipReason) {
        diagnostics.push({
          ...skipReason,
          pageIndex: item.pageIndex,
          targetId: item.id,
        });
        skippedTextItemCount += 1;
        continue;
      }

      drawOcrTextItem(context, item);
      embeddedTextItemCount += 1;
    }
  }

  if (embeddedTextItemCount === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'NO_OCR_TEXT_EMBEDDED',
      message: 'No OCR text was embedded into the searchable PDF.',
    });
  } else {
    diagnostics.push({
      level: 'info',
      code: 'OCR_TEXT_LAYER_ADDED',
      message: `${embeddedTextItemCount} OCR text item(s) embedded into PDF text layer.`,
    });
  }

  const bytes = await doc.save({
    useObjectStreams: input.disableObjectStreams ?? true ? false : true,
  });

  return {
    bytes,
    pageCount: pages.length,
    embeddedTextItemCount,
    skippedTextItemCount,
    diagnostics,
  };
}

export function ocrWordsToTextItems(
  page: OcrPageResult,
): OcrTextItem[] {
  return (page.words ?? []).map((word) => ({
    id: word.id,
    pageIndex: word.pageIndex,
    text: word.text,
    confidence: word.confidence,
    bbox: word.bbox,
  }));
}

export function ocrLinesToTextItems(
  page: OcrPageResult,
): OcrTextItem[] {
  return (page.lines ?? []).map((line) => ({
    id: line.id,
    pageIndex: line.pageIndex,
    text: line.text,
    confidence: line.confidence,
    bbox: line.bbox,
  }));
}

export function mapOcrRectToPdfPageRect(input: {
  rect: PdfRect;
  ocrPageSize: {
    width: number;
    height: number;
  };
  pdfPageSize: {
    width: number;
    height: number;
  };
}): PdfRect {
  const scaleX = input.pdfPageSize.width / Math.max(1, input.ocrPageSize.width);
  const scaleY = input.pdfPageSize.height / Math.max(1, input.ocrPageSize.height);

  return {
    x: input.rect.x * scaleX,
    y: input.rect.y * scaleY,
    width: input.rect.width * scaleX,
    height: input.rect.height * scaleY,
  };
}

function drawOcrTextItem(
  context: DrawOcrTextContext,
  item: OcrTextItem,
): void {
  const rect = mapOcrRectToPdfPageRect({
    rect: item.bbox,
    ocrPageSize: context.ocrPageSize,
    pdfPageSize: context.pageSize,
  });

  const sanitizedText = sanitizePdfText(item.text);

  if (!sanitizedText) {
    return;
  }

  const fontSize = fitFontSizeToRect({
    font: context.font,
    text: sanitizedText,
    rect,
  });

  const opacity = context.visibilityMode === 'debug-visible'
    ? 0.45
    : context.invisibleOpacity;

  const color = context.visibilityMode === 'debug-visible'
    ? context.rgb(1, 0, 0)
    : context.rgb(1, 1, 1);

  context.page.drawText(sanitizedText, {
    x: rect.x,
    y: rect.y,
    size: fontSize,
    font: context.font,
    color,
    opacity,
    maxWidth: Math.max(1, rect.width),
    lineHeight: Math.max(1, rect.height),
  });
}

function fitFontSizeToRect(input: {
  font: import('pdf-lib').PDFFont;
  text: string;
  rect: PdfRect;
}): number {
  const maxSize = Math.max(1, Math.min(input.rect.height, 24));
  const minSize = 1;

  if (!input.text.trim()) {
    return minSize;
  }

  let size = maxSize;

  while (size > minSize) {
    const width = input.font.widthOfTextAtSize(input.text, size);

    if (width <= input.rect.width || input.rect.width <= 1) {
      return size;
    }

    size -= 0.5;
  }

  return minSize;
}

function getOcrTextItemSkipDiagnostic(
  item: OcrTextItem,
  minConfidence: number,
): OcrSearchablePdfDiagnostic | null {
  if (!item.text.trim()) {
    return {
      level: 'warning',
      code: 'OCR_ITEM_SKIPPED_EMPTY_TEXT',
      message: 'OCR text item skipped because text is empty.',
    };
  }

  if (item.confidence < minConfidence) {
    return {
      level: 'info',
      code: 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE',
      message: `OCR text item skipped because confidence ${item.confidence} is below threshold ${minConfidence}.`,
    };
  }

  if (!isValidPdfRect(item.bbox)) {
    return {
      level: 'warning',
      code: 'OCR_ITEM_SKIPPED_INVALID_BBOX',
      message: 'OCR text item skipped because bbox is invalid.',
    };
  }

  return null;
}

function isValidPdfRect(rect: PdfRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function sanitizePdfText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 1 && code <= 8) continue;
    if (code === 11 || code === 12) continue;
    if (code >= 14 && code <= 31) continue;
    result += text[i];
  }
  return result.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
