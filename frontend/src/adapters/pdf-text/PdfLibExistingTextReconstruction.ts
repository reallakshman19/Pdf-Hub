import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  ExistingTextReplacementError,
} from '@/core/existing-text/replacementError';
import {
  assertPrintableAsciiReplacement,
} from '@/core/existing-text/replacementOperand';
import type {
  ExistingTextReconstructedReplacementMutationInput,
  ExistingTextReconstructedReplacementMutationResult,
} from '@/core/existing-text/reconstructedTypes';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  analyzeExistingTextVisualClearanceInDocument,
} from './PdfLibExistingTextVisualClearance';
import {
  resolveExistingTextStandard14BaseFont,
  resolveBestMatchingStandard14Font,
} from './PdfLibExistingTextFont';
import { extractPdfFontFromPage } from './PdfLibFontExtractor';
import { computeLineAlignmentLayout } from '@/core/existing-text/alignmentEngine';
import {
  snapRotationDegrees,
  computeRotatedWhiteoutRect,
  computeRotatedDrawOrigin,
} from '@/core/existing-text/rotatedTextGeometry';

type PdfLibDocument =
  import('pdf-lib').PDFDocument;
type PdfLibNamespace =
  Awaited<ReturnType<typeof pdfLib>>;

export async function applyReconstructedExistingTextReplacementToDocument(
  document: PdfLibDocument,
  lib: PdfLibNamespace,
  input: ExistingTextReconstructedReplacementMutationInput,
): Promise<ExistingTextReconstructedReplacementMutationResult> {
  throwIfAborted(
    input.signal,
    'revalidate reconstructed existing-text replacement',
  );
  assertPrintableAsciiReplacement(
    input.intent.replacementText,
  );

  const clearance =
    await analyzeExistingTextVisualClearanceInDocument(
      document,
      lib,
      input,
    );

  if (clearance.status !== 'proved') {
    throw new ExistingTextReplacementError(
      'RECONSTRUCTED_VISUAL_CLEARANCE_UNPROVED',
      'Reconstructed existing-text replacement is no longer safe on the current document.',
      [
        ...clearance.reasons.map(
          (reason) => `reason=${reason}`,
        ),
        ...clearance.diagnostics,
      ],
    );
  }

  throwIfAborted(
    input.signal,
    'apply reconstructed existing-text replacement',
  );

  const page =
    document.getPage(
      input.span.pageIndex,
    );

  let baseFont: string;
  try {
    baseFont = resolveExistingTextStandard14BaseFont(
      page,
      input.provenance.fontResourceName,
      lib,
    );
  } catch {
    const meta = extractPdfFontFromPage(page, input.provenance.fontResourceName, lib);
    baseFont = resolveBestMatchingStandard14Font(meta, input.provenance.fontResourceName);
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

  const embeddedFont =
    await raceWithAbort(
      document.embedFont(
        standardFont(
          baseFont,
          lib,
        ),
      ),
      input.signal,
      'embed reconstructed existing-text font',
    );

  const clearanceRect =
    clearance.proof
      .clearanceRectPt;

  const finalFontSizePt = style?.fontSizePt ?? input.provenance.fontSizePt;
  const finalColorHex = style?.colorHex ?? clearance.proof.targetTextColorHex;

  const lineWidthPt = embeddedFont.widthOfTextAtSize(
    input.intent.replacementText,
    finalFontSizePt,
  );

  const rotationDegrees = snapRotationDegrees(input.span.rotationDegrees ?? 0);
  const isRotated = Math.abs(rotationDegrees) > 0.5 && Math.abs(rotationDegrees - 360) > 0.5;

  // Visual clearance whiteout: rotated if span is rotated, axis-aligned otherwise
  if (isRotated) {
    const rotatedWhiteout = computeRotatedWhiteoutRect(
      input.span.originPt,
      Math.max(input.span.advanceWidthPt, lineWidthPt),
      finalFontSizePt,
      rotationDegrees,
      2,
    );
    page.drawRectangle({
      x: rotatedWhiteout.x,
      y: rotatedWhiteout.y,
      width: rotatedWhiteout.width,
      height: rotatedWhiteout.height,
      color: colorFromHex(
        clearance.proof.backgroundColorHex,
        lib,
      ),
      rotate: lib.degrees(rotationDegrees),
      borderWidth: 0,
      opacity: 1,
    });
  } else {
    page.drawRectangle({
      x: clearanceRect.x,
      y: clearanceRect.y,
      width: clearanceRect.width,
      height: clearanceRect.height,
      color: colorFromHex(
        clearance.proof.backgroundColorHex,
        lib,
      ),
      borderWidth: 0,
      opacity: 1,
    });
  }

  const layout = computeLineAlignmentLayout(
    input.intent.replacementText,
    lineWidthPt,
    clearanceRect.width,
    style?.align ?? 'left',
    true,
    {
      horizontalScalePercent: style?.horizontalScalePercent,
      letterSpacingPt: style?.letterSpacingPt,
    },
  );

  const drawOrigin = computeRotatedDrawOrigin(
    input.span.originPt,
    layout.offsetX,
    rotationDegrees,
  );

  if (layout.charSpacingPt !== 0) {
    page.pushOperators(lib.setCharacterSpacing(layout.charSpacingPt));
  }
  if (layout.horizontalScalePercent !== 100) {
    page.pushOperators(lib.setCharacterSqueeze(layout.horizontalScalePercent));
  }

  page.drawText(
    input.intent.replacementText,
    {
      x: drawOrigin.x,
      y: drawOrigin.y,
      size: finalFontSizePt,
      font: embeddedFont,
      color: colorFromHex(
        finalColorHex,
        lib,
      ),
      rotate: isRotated ? lib.degrees(rotationDegrees) : undefined,
      opacity: 1,
    },
  );

  if (layout.charSpacingPt !== 0) {
    page.pushOperators(lib.setCharacterSpacing(0));
  }
  if (layout.horizontalScalePercent !== 100) {
    page.pushOperators(lib.setCharacterSqueeze(100));
  }

  return {
    pageIndex:
      input.span.pageIndex,
    originalText:
      input.intent.expectedText,
    replacementText:
      input.intent.replacementText,
    fontResourceName:
      input.provenance
        .fontResourceName,
    baseFont,
    nativeFit:
      clearance.nativeFit,
    evidence:
      clearance.evidence,
    proof:
      clearance.proof,
  };
}

function standardFont(
  baseFont: string,
  lib: PdfLibNamespace,
): import('pdf-lib').StandardFonts {
  switch (baseFont) {
    case 'Helvetica':
      return lib.StandardFonts.Helvetica;
    case 'Helvetica-Bold':
      return lib.StandardFonts.HelveticaBold;
    case 'Helvetica-Oblique':
      return lib.StandardFonts.HelveticaOblique;
    case 'Helvetica-BoldOblique':
      return lib.StandardFonts.HelveticaBoldOblique;
    case 'Times-Roman':
      return lib.StandardFonts.TimesRoman;
    case 'Times-Bold':
      return lib.StandardFonts.TimesRomanBold;
    case 'Times-Italic':
      return lib.StandardFonts.TimesRomanItalic;
    case 'Times-BoldItalic':
      return lib.StandardFonts.TimesRomanBoldItalic;
    case 'Courier':
      return lib.StandardFonts.Courier;
    case 'Courier-Bold':
      return lib.StandardFonts.CourierBold;
    case 'Courier-Oblique':
      return lib.StandardFonts.CourierOblique;
    case 'Courier-BoldOblique':
      return lib.StandardFonts.CourierBoldOblique;
    default:
      throw new ExistingTextReplacementError(
        'UNSUPPORTED_FONT_RESOURCE',
        `Unsupported reconstructed Standard-14 font ${baseFont}.`,
      );
  }
}

function colorFromHex(
  hex: string,
  lib: PdfLibNamespace,
): import('pdf-lib').Color {
  const normalized =
    hex.replace('#', '');
  if (
    !/^[0-9a-fA-F]{6}$/.test(
      normalized,
    )
  ) {
    throw new ExistingTextReplacementError(
      'RECONSTRUCTED_VISUAL_CLEARANCE_UNPROVED',
      `Unproved reconstructed text color ${hex}.`,
    );
  }
  return lib.rgb(
    Number.parseInt(
      normalized.slice(0, 2),
      16,
    ) / 255,
    Number.parseInt(
      normalized.slice(2, 4),
      16,
    ) / 255,
    Number.parseInt(
      normalized.slice(4, 6),
      16,
    ) / 255,
  );
}
