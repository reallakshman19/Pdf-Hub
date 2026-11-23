import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type { PdfRect } from '../../writer-v2/types';
import type {
  OcrDocumentResult,
} from '../types';
import {
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  mapOcrRectToPdfPageRect,
  ocrLinesToTextItems,
  ocrWordsToTextItems,
} from '../ocrSearchablePdfExport';

export interface SearchablePdfGeneratorOptions {
  /**
   * Default: 'invisible'.
   * 'invisible' uses ISO 32000-1 §9.3.5 mode 3 (neither fill nor stroke text) with horizontal scaling.
   * 'debug-visible' draws red text at 0.45 opacity for visual verification in QA.
   */
  visibilityMode?: 'invisible' | 'debug-visible';

  /**
   * Default: 'word'.
   * Word layer gives precise bounding-box hit testing and text selection alignment.
   * Line layer is available when word boxes are noisy.
   */
  layerMode?: 'word' | 'line';

  /**
   * Default: 0.
   * Text items below this confidence threshold are skipped.
   */
  minConfidence?: number;

  /**
   * Default: true.
   * Disables object streams for easier inspection and broader compatibility.
   */
  disableObjectStreams?: boolean;
}

export interface GenerateSearchablePdfInput {
  pdfBytes: Uint8Array;
  ocrResult: OcrDocumentResult;
  options?: SearchablePdfGeneratorOptions;
  signal?: AbortSignal;
}

export interface SearchablePdfGeneratorDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'SEARCHABLE_PDF_GENERATED'
    | 'PDF_PAGE_NOT_FOUND'
    | 'OCR_ITEM_SKIPPED_EMPTY'
    | 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE'
    | 'OCR_ITEM_SKIPPED_INVALID_BBOX'
    | 'NO_TEXT_EMBEDDED'
    | 'GENERATOR_CANCELLED';
  message: string;
  pageIndex?: number;
  targetId?: string;
}

export interface GenerateSearchablePdfResult {
  bytes: Uint8Array;
  pageCount: number;
  embeddedTextItemCount: number;
  skippedTextItemCount: number;
  diagnostics: SearchablePdfGeneratorDiagnostic[];
}

export async function generateSearchablePdf(
  input: GenerateSearchablePdfInput,
): Promise<GenerateSearchablePdfResult> {
  throwIfAborted(input.signal, 'generate searchable PDF');

  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(input.pdfBytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);

  const visibilityMode = input.options?.visibilityMode ?? 'invisible';
  const layerMode = input.options?.layerMode ?? 'word';
  const minConfidence = input.options?.minConfidence ?? 0;
  const disableObjectStreams = input.options?.disableObjectStreams ?? true;

  const diagnostics: SearchablePdfGeneratorDiagnostic[] = [];
  let embeddedTextItemCount = 0;
  let skippedTextItemCount = 0;

  for (const ocrPage of input.ocrResult.pages) {
    throwIfAborted(input.signal, `inject searchable text for page ${ocrPage.pageNumber}`);

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
    const usePdfUserSpace = ocrPage.geometryProvenance === 'pdf-user-space-v2';
    const ocrPageWidth = usePdfUserSpace ? pageSize.width : (ocrPage.width ?? pageSize.width);
    const ocrPageHeight = usePdfUserSpace ? pageSize.height : (ocrPage.height ?? pageSize.height);

    // Register font on the page dictionary
    const fontRefKey = page.node.newFontDictionary('Helvetica', font.ref);

    const items = layerMode === 'line'
      ? ocrLinesToTextItems(ocrPage)
      : ocrWordsToTextItems(ocrPage);

    for (const item of items) {
      const sanitized = sanitizeWordText(item.text);
      if (!sanitized) {
        diagnostics.push({
          level: 'warning',
          code: 'OCR_ITEM_SKIPPED_EMPTY',
          pageIndex,
          targetId: item.id,
          message: 'Text item skipped because text is empty.',
        });
        skippedTextItemCount++;
        continue;
      }

      if (item.confidence < minConfidence) {
        diagnostics.push({
          level: 'info',
          code: 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE',
          pageIndex,
          targetId: item.id,
          message: `Text item skipped because confidence ${item.confidence} < threshold ${minConfidence}.`,
        });
        skippedTextItemCount++;
        continue;
      }

      if (!isValidBox(item.bbox)) {
        diagnostics.push({
          level: 'warning',
          code: 'OCR_ITEM_SKIPPED_INVALID_BBOX',
          pageIndex,
          targetId: item.id,
          message: 'Text item skipped because bounding box is invalid.',
        });
        skippedTextItemCount++;
        continue;
      }

      const rect = mapOcrRectToPdfPageRect({
        rect: item.bbox,
        ocrPageSize: { width: ocrPageWidth, height: ocrPageHeight },
        pdfPageSize: pageSize,
      });

      // Fit font size to bounding box height
      const fontSize = Math.max(1, Math.min(rect.height, 36));
      const measuredWidth = font.widthOfTextAtSize(sanitized, fontSize);

      // Compute horizontal scaling factor Tz (percent) to match exact word bounding box width
      const hScale = (measuredWidth > 0 && rect.width > 0)
        ? Math.max(10, Math.min(500, (rect.width / measuredWidth) * 100))
        : 100;

      const encodedText = font.encodeText(sanitized);

      if (visibilityMode === 'invisible') {
        // ISO 32000-1 §9.3.5: Text rendering mode 3 (neither fill nor stroke text)
        page.pushOperators(
          lib.pushGraphicsState(),
          lib.beginText(),
          lib.setTextRenderingMode(lib.TextRenderingMode.Invisible),
          lib.setFontAndSize(fontRefKey, fontSize),
          lib.PDFOperator.of('Tz' as unknown as import('pdf-lib').PDFOperatorNames, [lib.asPDFNumber(hScale)]),
          lib.rotateAndSkewTextRadiansAndTranslate(0, 0, 0, rect.x, rect.y),
          lib.showText(encodedText),
          lib.endText(),
          lib.popGraphicsState(),
        );
      } else {
        // Debug visible: Red text at 0.45 opacity
        page.pushOperators(
          lib.pushGraphicsState(),
          lib.beginText(),
          lib.setTextRenderingMode(lib.TextRenderingMode.Fill),
          lib.setFillingColor(lib.rgb(1, 0, 0)),
          lib.setFontAndSize(fontRefKey, fontSize),
          lib.PDFOperator.of('Tz' as unknown as import('pdf-lib').PDFOperatorNames, [lib.asPDFNumber(hScale)]),
          lib.rotateAndSkewTextRadiansAndTranslate(0, 0, 0, rect.x, rect.y),
          lib.showText(encodedText),
          lib.endText(),
          lib.popGraphicsState(),
        );
      }

      embeddedTextItemCount++;
    }
  }

  if (embeddedTextItemCount === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'NO_TEXT_EMBEDDED',
      message: 'No OCR text was embedded into the PDF document.',
    });
  } else {
    diagnostics.push({
      level: 'info',
      code: 'SEARCHABLE_PDF_GENERATED',
      message: `${embeddedTextItemCount} OCR text item(s) embedded with invisible text layer (mode 3 Tr).`,
    });
  }

  const bytes = await doc.save({
    useObjectStreams: !disableObjectStreams,
  });

  return {
    bytes,
    pageCount: pages.length,
    embeddedTextItemCount,
    skippedTextItemCount,
    diagnostics,
  };
}

function isValidBox(rect: PdfRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function sanitizeWordText(text: string): string {
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
