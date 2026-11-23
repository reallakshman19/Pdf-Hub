import {
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  assertPrintableAsciiReplacement,
} from '@/core/existing-text/replacementOperand';
import type {
  ExistingTextTableCellMutationInput,
  ExistingTextTableCellMutationResult,
} from '@/core/existing-text/tableCellTypes';
import { computeTableCellFit } from '@/core/existing-text/tableCellFitEngine';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  resolveBestMatchingStandard14Font,
  standardFontForBaseFont,
} from './PdfLibExistingTextFont';
import { extractPdfFontFromPage } from './PdfLibFontExtractor';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<ReturnType<typeof pdfLib>>;

export async function applyExistingTextTableCellReplacementToDocument(
  document: PdfLibDocument,
  lib: PdfLibNamespace,
  input: ExistingTextTableCellMutationInput,
): Promise<ExistingTextTableCellMutationResult> {
  throwIfAborted(
    input.signal,
    'apply existing-text table cell replacement',
  );
  assertPrintableAsciiReplacement(
    input.replacementText,
  );

  const page = document.getPage(input.span.pageIndex);
  const fontResourceName = input.span.fontName ?? 'Helvetica';

  let baseFont: string;
  try {
    const meta = extractPdfFontFromPage(page, fontResourceName, lib);
    baseFont = resolveBestMatchingStandard14Font(meta, fontResourceName);
  } catch {
    baseFont = resolveBestMatchingStandard14Font(null, fontResourceName);
  }

  // Handle styleOverride
  const style = input.styleOverride;
  if (style) {
    if (style.fontFamily) {
      if (style.fontFamily === 'Times-Roman') {
        baseFont = style.bold && style.italic ? 'Times-BoldItalic' : style.bold ? 'Times-Bold' : style.italic ? 'Times-Italic' : 'Times-Roman';
      } else if (style.fontFamily === 'Courier') {
        baseFont = style.bold && style.italic ? 'Courier-BoldOblique' : style.bold ? 'Courier-Bold' : style.italic ? 'Courier-Oblique' : 'Courier';
      } else {
        baseFont = style.bold && style.italic ? 'Helvetica-BoldOblique' : style.bold ? 'Helvetica-Bold' : style.italic ? 'Helvetica-Oblique' : 'Helvetica';
      }
    } else if (style.bold !== undefined || style.italic !== undefined) {
      const isBold = style.bold ?? baseFont.includes('Bold');
      const isItalic = style.italic ?? (baseFont.includes('Italic') || baseFont.includes('Oblique'));
      if (baseFont.startsWith('Times')) {
        baseFont = isBold && isItalic ? 'Times-BoldItalic' : isBold ? 'Times-Bold' : isItalic ? 'Times-Italic' : 'Times-Roman';
      } else if (baseFont.startsWith('Courier')) {
        baseFont = isBold && isItalic ? 'Courier-BoldOblique' : isBold ? 'Courier-Bold' : isItalic ? 'Courier-Oblique' : 'Courier';
      } else {
        baseFont = isBold && isItalic ? 'Helvetica-BoldOblique' : isBold ? 'Helvetica-Bold' : isItalic ? 'Helvetica-Oblique' : 'Helvetica';
      }
    }
  }

  const embeddedFont = await document.embedFont(standardFontForBaseFont(baseFont, lib));

  const measureWidthFn = (txt: string, size: number) => embeddedFont.widthOfTextAtSize(txt, size);
  const baseFontSize = style?.fontSizePt ?? input.span.fontSizePt;

  const fit = computeTableCellFit(
    input.cell,
    input.replacementText,
    measureWidthFn,
    baseFontSize,
    {
      preferredAlignment: input.alignment ?? style?.align,
    },
  );

  // 1. Emit whiteout clearance strictly constrained within cell bounds
  const cell = input.cell;
  const padding = 2;
  const whiteoutX = Math.max(cell.bounds.x, input.span.originPt.x - padding);
  const whiteoutY = Math.max(cell.bounds.y, input.span.originPt.y - 3);
  const whiteoutWidth = Math.min(
    cell.bounds.width,
    Math.max(input.span.advanceWidthPt, fit.replacementTextWidthPt) + padding * 2,
  );
  const whiteoutHeight = Math.min(
    cell.bounds.height,
    fit.effectiveFontSizePt * 1.35,
  );

  page.drawRectangle({
    x: whiteoutX,
    y: whiteoutY,
    width: whiteoutWidth,
    height: whiteoutHeight,
    color: lib.rgb(1, 1, 1),
    borderWidth: 0,
    opacity: 1,
  });

  // 2. Set horizontal squeeze Tz operator if scaled
  if (fit.horizontalScalingPercent !== 100) {
    page.pushOperators(lib.setCharacterSqueeze(fit.horizontalScalingPercent));
  }

  // 3. Draw replacement text
  const finalColorHex = style?.colorHex ?? '#000000';
  page.drawText(input.replacementText, {
    x: fit.baselineXPts,
    y: input.span.originPt.y,
    size: fit.effectiveFontSizePt,
    font: embeddedFont,
    color: colorFromHex(finalColorHex, lib),
    opacity: 1,
  });

  // 4. Restore Tz operator
  if (fit.horizontalScalingPercent !== 100) {
    page.pushOperators(lib.setCharacterSqueeze(100));
  }

  return {
    pageIndex: input.span.pageIndex,
    tableId: input.cell.tableId,
    rowIndex: input.cell.rowIndex,
    columnIndex: input.cell.columnIndex,
    originalText: input.cell.text,
    replacementText: input.replacementText,
    horizontalScalingPercent: fit.horizontalScalingPercent,
    effectiveFontSizePt: fit.effectiveFontSizePt,
    alignment: fit.alignment,
  };
}

function colorFromHex(hex: string, lib: PdfLibNamespace) {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return lib.rgb(r, g, b);
  }
  return lib.rgb(0, 0, 0);
}
