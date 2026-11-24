/**
 * PDF-lib Multi-Column Paragraph Reconstruction Adapter.
 * Applies visual clearance whiteouts across column segments and renders reflowed text lines.
 */

import type {
  MultiColumnParagraphIntent,
  MultiColumnParagraphResult,
} from '@/core/existing-text/columnFlowTypes';
import { reflowTextAcrossColumns } from '@/core/existing-text/multiColumnReflowEngine';
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

export async function applyMultiColumnParagraphReplacementToDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    pageIndex: number;
    intent: MultiColumnParagraphIntent;
  },
): Promise<MultiColumnParagraphResult> {
  const page = document.getPage(input.pageIndex);
  const layout = input.intent.layout;
  const fontSizePt =
    input.intent.styleOverride?.fontSizePt ?? layout.fontSizePt ?? 12;

  // 1. Resolve and embed font first to enable exact typographic advance measurement
  let baseFont = input.intent.layout.fontName ?? 'Helvetica';
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

  // 2. Reflow text across columns using exact typographic width measurements
  const reflowResult = reflowTextAcrossColumns(
    input.intent.replacementText,
    layout,
    {
      fontSizePt,
      leadingPt: layout.averageLeadingPt,
      fontName: baseFont,
      measureTextWidth: (str: string) => font.widthOfTextAtSize(str, fontSizePt),
    },
  );

  // 3. Fail-closed on layout overcapacity if requested (Finding F-04)
  if (reflowResult.overflowsEntireLayout && input.intent.overflowPolicy === 'fail-closed') {
    throw new Error(
      `LAYOUT_CAPACITY_EXCEEDED: Replacement text exceeds multi-column layout capacity (spillover: "${reflowResult.spillOverText}").`,
    );
  }

  const textColor = input.intent.styleOverride?.colorHex
    ? parseHexColor(input.intent.styleOverride.colorHex, lib)
    : lib.rgb(0, 0, 0);

  // 4. For each segment, emit whiteout rectangle and text lines
  for (const segment of reflowResult.segments) {
    // Whiteout clearance
    page.drawRectangle({
      x: segment.columnBoundsPt.x - 2,
      y: segment.columnBoundsPt.y - 2,
      width: segment.columnBoundsPt.width + 4,
      height: segment.columnBoundsPt.height + 4,
      color: lib.rgb(1, 1, 1),
      borderWidth: 0,
      opacity: 1,
    });

    // Draw lines
    for (let i = 0; i < segment.lines.length; i++) {
      const line = segment.lines[i];
      const baseline = segment.lineBaselinesPt[i];
      page.drawText(line, {
        x: baseline.x,
        y: baseline.y,
        size: fontSizePt,
        font,
        color: textColor,
      });
    }
  }

  return {
    success: true,
    pageIndex: input.pageIndex,
    bytesModified: true,
    columnsUsed: reflowResult.columnsUsed,
    totalLinesEmitted: reflowResult.totalLines,
    overflowsEntireLayout: reflowResult.overflowsEntireLayout,
    spillOverText: reflowResult.spillOverText,
    warning: reflowResult.overflowsEntireLayout
      ? `Replacement text overflowed total layout capacity. Unplaced text: "${reflowResult.spillOverText}".`
      : undefined,
    details: {
      whiteoutRectsEmitted: reflowResult.segments.length,
      segments: reflowResult.segments,
    },
  };
}

export async function applyMultiColumnParagraphReplacementInBytes(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    pageIndex: number;
    intent: MultiColumnParagraphIntent;
  },
): Promise<{
  modifiedBytes: Uint8Array;
  result: MultiColumnParagraphResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await applyMultiColumnParagraphReplacementToDocument(
    document,
    lib,
    input,
  );
  const modifiedBytes = await document.save();

  return {
    modifiedBytes,
    result,
  };
}
