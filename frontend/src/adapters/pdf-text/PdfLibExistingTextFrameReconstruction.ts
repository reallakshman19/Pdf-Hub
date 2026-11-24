/**
 * PDF-lib Existing Text Frame Reconstruction Adapter.
 * Applies visual clearance whiteout at the original frame bounds and renders
 * repositioned or reflowed text lines at the target coordinates.
 */

import type {
  MoveTextFrameIntent,
  ResizeTextFrameIntent,
  MoveTextFrameResult,
  ResizeTextFrameResult,
} from '@/core/existing-text/frameManipulationTypes';
import { calculateFrameResizeReflow } from '@/core/existing-text/frameGeometry';
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

function resolveStandardFontName(
  baseName?: string,
  isBold?: boolean,
  isItalic?: boolean,
): string {
  const base = baseName ?? 'Helvetica';
  if (isBold && isItalic) {
    return base.includes('Times')
      ? 'Times-BoldItalic'
      : base.includes('Courier')
        ? 'Courier-BoldOblique'
        : 'Helvetica-BoldOblique';
  }
  if (isBold) {
    return base.includes('Times')
      ? 'Times-Bold'
      : base.includes('Courier')
        ? 'Courier-Bold'
        : 'Helvetica-Bold';
  }
  if (isItalic) {
    return base.includes('Times')
      ? 'Times-Italic'
      : base.includes('Courier')
        ? 'Courier-Oblique'
        : 'Helvetica-Oblique';
  }
  return base.includes('Times')
    ? 'Times-Roman'
    : base.includes('Courier')
      ? 'Courier'
      : 'Helvetica';
}

/**
 * Moves an existing text frame to new target coordinates in a PDF document.
 */
export async function applyMoveTextFrameToDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    pageIndex: number;
    intent: MoveTextFrameIntent;
  },
): Promise<MoveTextFrameResult> {
  const page = document.getPage(input.pageIndex);
  const frame = input.intent.frame;
  const orig = frame.originalBounds ?? frame.bounds;
  const fontSizePt = frame.styleOverride?.fontSizePt ?? frame.fontSizePt ?? 12;
  const leadingPt = frame.leadingPt ?? Math.round(fontSizePt * 1.3);

  // 1. Inpaint source region to clear original text
  const bgColor = input.intent.backgroundColorHex
    ? parseHexColor(input.intent.backgroundColorHex, lib)
    : lib.rgb(1, 1, 1);

  page.drawRectangle({
    x: orig.x - 2,
    y: orig.y - 3,
    width: orig.width + 4,
    height: orig.height + 5,
    color: bgColor,
    borderWidth: 0,
    opacity: 1,
  });

  // 2. Embed standard font
  const fontName = resolveStandardFontName(
    frame.fontName,
    frame.styleOverride?.bold,
    frame.styleOverride?.italic,
  );
  const standardFontEnum = standardFontForBaseFont(fontName, lib);
  const font = await document.embedFont(standardFontEnum);

  const textColor = frame.styleOverride?.colorHex
    ? parseHexColor(frame.styleOverride.colorHex, lib)
    : lib.rgb(0, 0, 0);

  // 3. Render lines at target position
  const targetX = input.intent.targetPosition.x;
  const targetY = input.intent.targetPosition.y;
  const lines = frame.text.split(/\r?\n/);
  const topBaselineY = targetY + frame.bounds.height - fontSizePt;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineY = topBaselineY - i * leadingPt;
    let lineX = targetX;

    if (frame.align === 'center') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      lineX = targetX + Math.max(0, (frame.bounds.width - lineWidth) / 2);
    } else if (frame.align === 'right') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      lineX = targetX + Math.max(0, frame.bounds.width - lineWidth);
    }

    page.drawText(line, {
      x: lineX,
      y: lineY,
      size: fontSizePt,
      font,
      color: textColor,
    });
  }

  const newBounds = {
    x: targetX,
    y: targetY,
    width: frame.bounds.width,
    height: frame.bounds.height,
  };

  return {
    mutatedBytes: new Uint8Array(),
    newBounds,
  };
}

/**
 * Resizes an existing text frame and dynamically re-wraps text lines.
 */
export async function applyResizeTextFrameToDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    pageIndex: number;
    intent: ResizeTextFrameIntent;
  },
): Promise<ResizeTextFrameResult> {
  const page = document.getPage(input.pageIndex);
  const frame = input.intent.frame;
  const orig = frame.originalBounds ?? frame.bounds;
  const fontSizePt = frame.styleOverride?.fontSizePt ?? frame.fontSizePt ?? 12;
  const leadingPt = frame.leadingPt ?? Math.round(fontSizePt * 1.3);

  // 1. Inpaint source region
  const bgColor = input.intent.backgroundColorHex
    ? parseHexColor(input.intent.backgroundColorHex, lib)
    : lib.rgb(1, 1, 1);

  page.drawRectangle({
    x: orig.x - 2,
    y: orig.y - 3,
    width: orig.width + 4,
    height: orig.height + 5,
    color: bgColor,
    borderWidth: 0,
    opacity: 1,
  });

  // 2. Embed standard font
  const fontName = resolveStandardFontName(
    frame.fontName,
    frame.styleOverride?.bold,
    frame.styleOverride?.italic,
  );
  const standardFontEnum = standardFontForBaseFont(fontName, lib);
  const font = await document.embedFont(standardFontEnum);

  const textColor = frame.styleOverride?.colorHex
    ? parseHexColor(frame.styleOverride.colorHex, lib)
    : lib.rgb(0, 0, 0);

  // 3. Re-wrap lines according to new width
  const reflow = calculateFrameResizeReflow(frame, input.intent.newWidthPt, {
    measureWidth: (str, size) => font.widthOfTextAtSize(str, size),
  });

  const lines = reflow.lines;
  const startX = frame.bounds.x;
  const startY = frame.bounds.y;
  const topBaselineY = startY + reflow.newHeightPt - fontSizePt;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineY = topBaselineY - i * leadingPt;
    let lineX = startX;

    if (frame.align === 'center') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      lineX = startX + Math.max(0, (reflow.newWidthPt - lineWidth) / 2);
    } else if (frame.align === 'right') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      lineX = startX + Math.max(0, reflow.newWidthPt - lineWidth);
    }

    page.drawText(line, {
      x: lineX,
      y: lineY,
      size: fontSizePt,
      font,
      color: textColor,
    });
  }

  const newBounds = {
    x: startX,
    y: startY,
    width: reflow.newWidthPt,
    height: reflow.newHeightPt,
  };

  return {
    mutatedBytes: new Uint8Array(),
    newBounds,
    lines,
  };
}

export async function applyMoveTextFrameInBytes(input: {
  pdfBytes: Uint8Array;
  currentRevisionId: string;
  pageIndex: number;
  intent: MoveTextFrameIntent;
}): Promise<{
  modifiedBytes: Uint8Array;
  result: MoveTextFrameResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await applyMoveTextFrameToDocument(document, lib, input);
  const modifiedBytes = await document.save();
  result.mutatedBytes = modifiedBytes;

  return {
    modifiedBytes,
    result,
  };
}

export async function applyResizeTextFrameInBytes(input: {
  pdfBytes: Uint8Array;
  currentRevisionId: string;
  pageIndex: number;
  intent: ResizeTextFrameIntent;
}): Promise<{
  modifiedBytes: Uint8Array;
  result: ResizeTextFrameResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await applyResizeTextFrameToDocument(document, lib, input);
  const modifiedBytes = await document.save();
  result.mutatedBytes = modifiedBytes;

  return {
    modifiedBytes,
    result,
  };
}
