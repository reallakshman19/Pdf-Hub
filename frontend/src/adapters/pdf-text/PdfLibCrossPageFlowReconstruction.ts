/**
 * PDF-lib Cross-Page Paragraph & Multi-Column Flow Reconstruction Adapter.
 * Applies multi-page visual clearance whiteouts and renders reflowed text lines across Page N and Page N+1.
 */

import type {
  CrossPageFlowIntent,
  CrossPageFlowResult,
} from '@/core/existing-text/crossPageFlowTypes';
import { executeCrossPageFlow } from '@/core/existing-text/crossPageFlowEngine';
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

export async function applyCrossPageFlowToDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    intent: CrossPageFlowIntent;
  },
): Promise<CrossPageFlowResult> {
  const pageCount = document.getPageCount();
  const sourcePageIndex = input.intent.sourcePageIndex;
  const targetPageIndex = input.intent.targetPageIndex;

  if (sourcePageIndex < 0 || sourcePageIndex >= pageCount) {
    throw new Error(`Invalid sourcePageIndex ${sourcePageIndex} (pageCount: ${pageCount})`);
  }
  if (targetPageIndex < 0 || targetPageIndex >= pageCount) {
    throw new Error(`Invalid targetPageIndex ${targetPageIndex} (pageCount: ${pageCount})`);
  }

  const sourcePage = document.getPage(sourcePageIndex);
  const targetPage = document.getPage(targetPageIndex);

  const fontSizePt =
    input.intent.styleOverride?.fontSizePt ??
    input.intent.sourceLayout.fontSizePt ??
    12;

  // 1. Resolve and embed font
  let baseFont = input.intent.sourceLayout.fontName ?? 'Helvetica';
  const isBold = input.intent.styleOverride?.bold;
  const isItalic = input.intent.styleOverride?.italic;
  if (isBold && isItalic) {
    baseFont = baseFont.includes('Times')
      ? 'Times-BoldItalic'
      : baseFont.includes('Courier')
        ? 'Courier-BoldOblique'
        : 'Helvetica-BoldOblique';
  } else if (isBold) {
    baseFont = baseFont.includes('Times')
      ? 'Times-Bold'
      : baseFont.includes('Courier')
        ? 'Courier-Bold'
        : 'Helvetica-Bold';
  } else if (isItalic) {
    baseFont = baseFont.includes('Times')
      ? 'Times-Italic'
      : baseFont.includes('Courier')
        ? 'Courier-Oblique'
        : 'Helvetica-Oblique';
  }

  const standardFontEnum = standardFontForBaseFont(baseFont, lib);
  const font = await document.embedFont(standardFontEnum);

  const textColor = input.intent.styleOverride?.colorHex
    ? parseHexColor(input.intent.styleOverride.colorHex, lib)
    : lib.rgb(0, 0, 0);

  // 2. Execute cross-page flow using exact font width measurement
  const flowResult = executeCrossPageFlow(input.intent, {
    fontSizePt,
    leadingPt: input.intent.sourceLayout.averageLeadingPt,
    fontName: baseFont,
    measureTextWidth: (str: string) => font.widthOfTextAtSize(str, fontSizePt),
  });

  // 3. Render Source Page N
  for (const segment of flowResult.sourceSegments) {
    sourcePage.drawRectangle({
      x: segment.columnBoundsPt.x - 2,
      y: segment.columnBoundsPt.y - 2,
      width: segment.columnBoundsPt.width + 4,
      height: segment.columnBoundsPt.height + 4,
      color: lib.rgb(1, 1, 1),
      borderWidth: 0,
      opacity: 1,
    });

    for (let i = 0; i < segment.lines.length; i++) {
      const line = segment.lines[i];
      const baseline = segment.lineBaselinesPt[i];
      sourcePage.drawText(line, {
        x: baseline.x,
        y: baseline.y,
        size: fontSizePt,
        font,
        color: textColor,
      });
    }
  }

  // 4. Render Target Page N+1 (if spillover occurred)
  for (const segment of flowResult.targetSegments) {
    targetPage.drawRectangle({
      x: segment.columnBoundsPt.x - 2,
      y: segment.columnBoundsPt.y - 2,
      width: segment.columnBoundsPt.width + 4,
      height: segment.columnBoundsPt.height + 4,
      color: lib.rgb(1, 1, 1),
      borderWidth: 0,
      opacity: 1,
    });

    for (let i = 0; i < segment.lines.length; i++) {
      const line = segment.lines[i];
      const baseline = segment.lineBaselinesPt[i];
      targetPage.drawText(line, {
        x: baseline.x,
        y: baseline.y,
        size: fontSizePt,
        font,
        color: textColor,
      });
    }
  }

  return flowResult;
}

export async function applyCrossPageFlowInBytes(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    intent: CrossPageFlowIntent;
  },
): Promise<{
  modifiedBytes: Uint8Array;
  result: CrossPageFlowResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await applyCrossPageFlowToDocument(document, lib, input);
  const modifiedBytes = await document.save();

  return {
    modifiedBytes,
    result,
  };
}
