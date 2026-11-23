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
    | 'OCR_NATIVE_TEXT_PRESERVED'
    | 'NO_OCR_TEXT_EMBEDDED';
  message: string;
  pageIndex?: number;
  targetId?: string;
}

interface DrawOcrTextContext {
  page: import('pdf-lib').PDFPage;
  font: import('pdf-lib').PDFFont;
  fontRefKey: import('pdf-lib').PDFName;
  lib: typeof import('pdf-lib');
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
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(input.pdfBytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);

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

    if (ocrPage.diagnostics?.some((diagnostic) => diagnostic.code === 'PAGE_SKIPPED_BORN_DIGITAL')) {
      diagnostics.push({
        level: 'info',
        code: 'OCR_NATIVE_TEXT_PRESERVED',
        pageIndex,
        message: 'The source PDF already contains searchable text on this page.',
      });
      continue;
    }

    const pageSize = page.getSize();
    const usePdfUserSpace = ocrPage.geometryProvenance === 'pdf-user-space-v2';
    const ocrPageWidth = usePdfUserSpace ? pageSize.width : (ocrPage.width ?? pageSize.width);
    const ocrPageHeight = usePdfUserSpace ? pageSize.height : (ocrPage.height ?? pageSize.height);

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

    const fontRefKey = page.node.newFontDictionary('Helvetica', font.ref);

    const context: DrawOcrTextContext = {
      page,
      font,
      fontRefKey,
      lib,
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

  const fontSize = Math.max(1, Math.min(rect.height, 36));
  const measuredWidth = context.font.widthOfTextAtSize(sanitizedText, fontSize);
  const hScale = (measuredWidth > 0 && rect.width > 0)
    ? Math.max(10, Math.min(500, (rect.width / measuredWidth) * 100))
    : 100;

  const encodedText = context.font.encodeText(sanitizedText);

  if (context.visibilityMode === 'invisible') {
    // ISO 32000-1 §9.3.5: Text rendering mode 3 (neither fill nor stroke text)
    context.page.pushOperators(
      context.lib.pushGraphicsState(),
      context.lib.beginText(),
      context.lib.setTextRenderingMode(context.lib.TextRenderingMode.Invisible),
      context.lib.setFontAndSize(context.fontRefKey, fontSize),
      context.lib.PDFOperator.of('Tz' as unknown as import('pdf-lib').PDFOperatorNames, [context.lib.asPDFNumber(hScale)]),
      context.lib.rotateAndSkewTextRadiansAndTranslate(0, 0, 0, rect.x, rect.y),
      context.lib.showText(encodedText),
      context.lib.endText(),
      context.lib.popGraphicsState(),
    );
  } else {
    // Debug visible: Red text at 0.45 opacity
    context.page.pushOperators(
      context.lib.pushGraphicsState(),
      context.lib.beginText(),
      context.lib.setTextRenderingMode(context.lib.TextRenderingMode.Fill),
      context.lib.setFillingColor(context.lib.rgb(1, 0, 0)),
      context.lib.setFontAndSize(context.fontRefKey, fontSize),
      context.lib.PDFOperator.of('Tz' as unknown as import('pdf-lib').PDFOperatorNames, [context.lib.asPDFNumber(hScale)]),
      context.lib.rotateAndSkewTextRadiansAndTranslate(0, 0, 0, rect.x, rect.y),
      context.lib.showText(encodedText),
      context.lib.endText(),
      context.lib.popGraphicsState(),
    );
  }
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
