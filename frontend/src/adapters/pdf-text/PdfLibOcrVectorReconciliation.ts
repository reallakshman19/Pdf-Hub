/**
 * PDF-lib OCR-to-Native Vector Text Reconciliation Engine.
 * Inpaints rasterized scanned pixels and synthesizes clean, selectable native vector PDF text.
 */

import type {
  OcrTextReconciliationIntent,
  OcrTextReconciliationResult,
} from '@/core/existing-text/ocrNativeReconciliationTypes';
import { standardFontForBaseFont } from './PdfLibExistingTextFont';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;

function parseHexColor(hex: string, lib: PdfLibNs): import('pdf-lib').RGB {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) {
    return lib.rgb(0, 0, 0);
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return lib.rgb(
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  );
}

export async function reconcileOcrTextInDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    pageIndex: number;
    intent: OcrTextReconciliationIntent;
  },
): Promise<OcrTextReconciliationResult> {
  const page = document.getPage(input.pageIndex);
  const bounds = input.intent.targetBoundsPt;

  // 1. Inpaint rasterized image area under text with background color & descender padding (Finding F-06)
  const bgColorHex = input.intent.backgroundColorHex ?? '#ffffff';
  const bgColor = parseHexColor(bgColorHex, lib);

  // Generous padding: 2pt horizontal, 3pt below baseline to cover descenders (g, y, p, q, j)
  const inpaintRect = {
    x: bounds.x - 2,
    y: bounds.y - 3,
    width: bounds.width + 4,
    height: bounds.height + 5,
  };

  page.drawRectangle({
    x: inpaintRect.x,
    y: inpaintRect.y,
    width: inpaintRect.width,
    height: inpaintRect.height,
    color: bgColor,
    borderWidth: 0,
    opacity: 1,
  });

  // 2. Synthesize native vector text
  const baseFont = input.intent.fontFamily ?? 'Helvetica';
  const standardFontEnum = standardFontForBaseFont(baseFont, lib);
  const font = await document.embedFont(standardFontEnum);

  const textColor = input.intent.colorHex
    ? parseHexColor(input.intent.colorHex, lib)
    : lib.rgb(0, 0, 0);

  page.drawText(input.intent.editedText, {
    x: bounds.x,
    y: bounds.y,
    size: input.intent.fontSizePt,
    font,
    color: textColor,
  });

  return {
    success: true,
    pageIndex: input.pageIndex,
    bytesModified: true,
    rasterInpainted: true,
    vectorTextSynthesized: true,
    synthesizedSpanId: `synthesized-ocr-${input.intent.ocrBlockId}`,
    details: {
      whiteoutRectPt: inpaintRect,
      textEmitted: input.intent.editedText,
      fontSizePt: input.intent.fontSizePt,
      backgroundColorHex: bgColorHex,
    },
  };
}

export async function reconcileOcrTextInBytes(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    pageIndex: number;
    intent: OcrTextReconciliationIntent;
  },
): Promise<{
  modifiedBytes: Uint8Array;
  result: OcrTextReconciliationResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await reconcileOcrTextInDocument(document, lib, input);
  const modifiedBytes = await document.save();

  return {
    modifiedBytes,
    result,
  };
}
