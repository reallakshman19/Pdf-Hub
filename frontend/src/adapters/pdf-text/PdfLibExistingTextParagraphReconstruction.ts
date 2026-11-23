import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type {
  ExistingTextParagraphReplacementMutationInput,
  ExistingTextParagraphReplacementMutationResult,
} from '@/core/existing-text/paragraphTypes';
import type { ExistingTextFitRect } from '@/core/existing-text/fitTypes';
import { reflowParagraphText } from '@/core/existing-text/paragraphReflowEngine';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  resolveBestMatchingStandard14Font,
  standardFontForBaseFont,
} from './PdfLibExistingTextFont';
import { extractPdfFontFromPage } from './PdfLibFontExtractor';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<ReturnType<typeof pdfLib>>;

export async function applyExistingTextParagraphReplacementToDocument(
  document: PdfLibDocument,
  lib: PdfLibNamespace,
  input: ExistingTextParagraphReplacementMutationInput,
): Promise<ExistingTextParagraphReplacementMutationResult> {
  throwIfAborted(
    input.signal,
    'apply existing-text paragraph replacement',
  );

  const page = document.getPage(input.paragraph.pageIndex);
  const firstSpan = input.paragraph.lines[0]?.span;
  const fontResourceName = firstSpan?.fontName ?? input.paragraph.fontName ?? 'Helvetica';

  let baseFont: string;
  try {
    const meta = extractPdfFontFromPage(page, fontResourceName, lib);
    baseFont = resolveBestMatchingStandard14Font(meta, fontResourceName);
  } catch {
    baseFont = resolveBestMatchingStandard14Font(null, fontResourceName);
  }

  // Handle styleOverride font family/weight/style if specified
  const style = input.intent.styleOverride;
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

  const standardFontEnum = standardFontForBaseFont(baseFont, lib);
  const embeddedFont = await raceWithAbort(
    document.embedFont(standardFontEnum),
    input.signal,
    'embed paragraph replacement font',
  );

  const finalFontSizePt = style?.fontSizePt ?? input.paragraph.fontSizePt;
  const finalLeadingPt = input.intent.reflowOptions?.leadingPt ?? input.paragraph.leadingPt;
  const finalColor = colorFromHex(style?.colorHex ?? '#000000', lib);

  // Measure text with exact embedded font metrics
  const measureFn = (text: string, size: number) => {
    try {
      return embeddedFont.widthOfTextAtSize(text, size);
    } catch {
      return text.length * size * 0.52;
    }
  };

  const reflowResult = reflowParagraphText(
    input.paragraph,
    input.intent.replacementText,
    {
      columnWidthPt: input.intent.reflowOptions?.columnWidthPt ?? input.paragraph.columnWidthPt,
      leadingPt: finalLeadingPt,
      fontSizePt: finalFontSizePt,
      align: style?.align ?? input.intent.reflowOptions?.align,
      horizontalScalePercent: style?.horizontalScalePercent ?? input.intent.reflowOptions?.horizontalScalePercent,
      letterSpacingPt: style?.letterSpacingPt ?? input.intent.reflowOptions?.letterSpacingPt,
    },
    measureFn,
  );

  // Compute union bounding box covering both original paragraph and reflowed text
  const origBounds = input.paragraph.boundsPt;
  const reflowBounds = reflowResult.boundsPt;

  const unionBounds: ExistingTextFitRect = {
    x: Math.min(origBounds.x, reflowBounds.x) - 1,
    y: Math.min(origBounds.y, reflowBounds.y) - 1,
    width: Math.max(origBounds.x + origBounds.width, reflowBounds.x + reflowBounds.width) - Math.min(origBounds.x, reflowBounds.x) + 2,
    height: Math.max(origBounds.y + origBounds.height, reflowBounds.y + reflowBounds.height) - Math.min(origBounds.y, reflowBounds.y) + 2,
  };

  // 1. Whiteout original paragraph area
  page.drawRectangle({
    x: unionBounds.x,
    y: unionBounds.y,
    width: unionBounds.width,
    height: unionBounds.height,
    color: lib.rgb(1, 1, 1),
    opacity: 1,
  });

  // 2. Draw reflowed lines
  for (const line of reflowResult.lines) {
    if (line.text.trim().length === 0) continue;

    const layout = line.alignmentLayout;
    if (layout) {
      if (layout.wordSpacingPt > 0) {
        page.pushOperators(lib.setWordSpacing(layout.wordSpacingPt));
      }
      if (layout.charSpacingPt !== 0) {
        page.pushOperators(lib.setCharacterSpacing(layout.charSpacingPt));
      }
      if (layout.horizontalScalePercent !== 100) {
        page.pushOperators(lib.setCharacterSqueeze(layout.horizontalScalePercent));
      }
    }

    page.drawText(line.text, {
      x: line.baselinePt.x,
      y: line.baselinePt.y,
      size: finalFontSizePt,
      font: embeddedFont,
      color: finalColor,
      opacity: 1,
    });

    if (layout) {
      if (layout.wordSpacingPt > 0) {
        page.pushOperators(lib.setWordSpacing(0));
      }
      if (layout.charSpacingPt !== 0) {
        page.pushOperators(lib.setCharacterSpacing(0));
      }
      if (layout.horizontalScalePercent !== 100) {
        page.pushOperators(lib.setCharacterSqueeze(100));
      }
    }
  }

  return {
    paragraphId: input.paragraph.paragraphId,
    pageIndex: input.paragraph.pageIndex,
    originalLineCount: input.paragraph.lines.length,
    reflowedLineCount: reflowResult.lines.length,
    originalText: input.paragraph.fullText,
    replacementText: input.intent.replacementText,
    boundsPt: unionBounds,
    mutationStrategy: 'reconstructed-block',
  };
}

function colorFromHex(
  hex: string,
  lib: PdfLibNamespace,
): import('pdf-lib').Color {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return lib.rgb(0, 0, 0);
  }
  return lib.rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}
