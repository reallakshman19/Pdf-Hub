import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT,
  type ExistingTextNativeFitDiagnostic,
} from '@/core/existing-text/fitTypes';
import { encodeTextForFont, type PdfFontMetadata } from '@/core/pdf-fonts';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibNs =
  Awaited<
    ReturnType<typeof pdfLib>
  >;

export async function measureExistingTextNativeFit(
  input: {
    baseFont: string;
    sourceText: string;
    replacementText: string;
    observedAdvancePt: number;
    fontSizePt: number;
    fontMetadata?: PdfFontMetadata | null;
    /** Page-space Tc / Tw that the rewritten operator keeps applying (ISO 32000-1 §9.3.2–9.3.3). */
    spacingPt?: { char: number; word: number };
    signal?: AbortSignal;
  },
  lib?: PdfLibNs,
): Promise<ExistingTextNativeFitDiagnostic> {
  const tolerancePt =
    EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT;

  if (
    !Number.isFinite(
      input.observedAdvancePt,
    )
    || input.observedAdvancePt <= 0
  ) {
    return {
      schemaVersion: 1,
      status: 'unmeasurable',
      reason:
        'INVALID_OBSERVED_ADVANCE',
      baseFont: input.baseFont,
      sourceText: input.sourceText,
      replacementText:
        input.replacementText,
      observedAdvancePt:
        input.observedAdvancePt,
      fontSizePt:
        input.fontSizePt,
      tolerancePt,
    };
  }

  if (
    !Number.isFinite(
      input.fontSizePt,
    )
    || input.fontSizePt <= 0
  ) {
    return {
      schemaVersion: 1,
      status: 'unmeasurable',
      reason: 'INVALID_FONT_SIZE',
      baseFont: input.baseFont,
      sourceText: input.sourceText,
      replacementText:
        input.replacementText,
      observedAdvancePt:
        input.observedAdvancePt,
      fontSizePt:
        input.fontSizePt,
      tolerancePt,
    };
  }

  throwIfAborted(
    input.signal,
    'measure existing-text replacement fit',
  );

  let measuredSourceWidthPt: number;
  let measuredReplacementWidthPt: number;

  const shouldUseFontMetadata =
    input.fontMetadata
    && (input.fontMetadata.subtype === 'Type0'
      || (input.fontMetadata.metrics.widths.size > 0 && !isStandard14Font(input.baseFont)));

  if (shouldUseFontMetadata && input.fontMetadata) {
    const sourceEnc = encodeTextForFont(
      input.sourceText,
      input.fontMetadata,
      input.fontSizePt,
    );
    const replEnc = encodeTextForFont(
      input.replacementText,
      input.fontMetadata,
      input.fontSizePt,
    );

    if (replEnc.status === 'missing-glyphs') {
      return {
        schemaVersion: 1,
        status: 'unmeasurable',
        reason: 'MISSING_SUBSET_GLYPHS',
        missingCharacters: replEnc.missingCharacters,
        baseFont: input.baseFont,
        sourceText: input.sourceText,
        replacementText: input.replacementText,
        observedAdvancePt: input.observedAdvancePt,
        fontSizePt: input.fontSizePt,
        tolerancePt,
      };
    }

    measuredSourceWidthPt =
      sourceEnc.status === 'encodable' && sourceEnc.advanceWidthPt > 0
        ? sourceEnc.advanceWidthPt
        : input.observedAdvancePt;
    measuredReplacementWidthPt = replEnc.advanceWidthPt;
  } else {
    const resolvedLib =
      lib ?? await pdfLib();
    const standardFont =
      standardFontForBaseFont(
        input.baseFont,
        resolvedLib,
      );
    const measurementDocument =
      await raceWithAbort(
        resolvedLib.PDFDocument.create(),
        input.signal,
        'create Standard-14 fit measurement document',
      );
    const font =
      await raceWithAbort(
        measurementDocument
          .embedFont(
            standardFont,
          ),
        input.signal,
        'load Standard-14 fit metrics',
      );

    measuredSourceWidthPt =
      font.widthOfTextAtSize(
        input.sourceText,
        input.fontSizePt,
      );
    measuredReplacementWidthPt =
      font.widthOfTextAtSize(
        input.replacementText,
        input.fontSizePt,
      );
  }

  if (
    !Number.isFinite(
      measuredSourceWidthPt,
    )
    || !Number.isFinite(
      measuredReplacementWidthPt,
    )
  ) {
    return {
      schemaVersion: 1,
      status: 'unmeasurable',
      reason: 'NON_FINITE_METRIC',
      baseFont: input.baseFont,
      sourceText: input.sourceText,
      replacementText:
        input.replacementText,
      observedAdvancePt:
        input.observedAdvancePt,
      fontSizePt:
        input.fontSizePt,
      tolerancePt,
    };
  }

  if (measuredSourceWidthPt <= 0) {
    return {
      schemaVersion: 1,
      status: 'unmeasurable',
      reason: 'SOURCE_METRIC_ZERO',
      baseFont: input.baseFont,
      sourceText: input.sourceText,
      replacementText:
        input.replacementText,
      observedAdvancePt:
        input.observedAdvancePt,
      fontSizePt:
        input.fontSizePt,
      tolerancePt,
    };
  }

  // Tc/Tw add a fixed amount per glyph / space on top of the glyph widths, so
  // they are taken out of the observed advance before scaling and added back
  // for the replacement's own glyph and space count.
  const sourceSpacingPt =
    spacingAdvancePt(input.sourceText, input.spacingPt);
  const replacementSpacingPt =
    spacingAdvancePt(input.replacementText, input.spacingPt);
  const observedGlyphAdvancePt =
    input.observedAdvancePt - sourceSpacingPt;
  if (
    !Number.isFinite(observedGlyphAdvancePt)
    || observedGlyphAdvancePt <= 0
  ) {
    return {
      schemaVersion: 1,
      status: 'unmeasurable',
      reason: 'INVALID_OBSERVED_ADVANCE',
      baseFont: input.baseFont,
      sourceText: input.sourceText,
      replacementText:
        input.replacementText,
      observedAdvancePt:
        input.observedAdvancePt,
      fontSizePt:
        input.fontSizePt,
      tolerancePt,
    };
  }
  const observedToMetricScale =
    observedGlyphAdvancePt
    / measuredSourceWidthPt;
  const projectedReplacementAdvancePt =
    measuredReplacementWidthPt
    * observedToMetricScale
    + replacementSpacingPt;
  const overflowPt =
    Math.max(
      0,
      projectedReplacementAdvancePt
      - input.observedAdvancePt,
    );
  const status =
    projectedReplacementAdvancePt
      <= input.observedAdvancePt
        + tolerancePt
      ? 'fits'
      : 'overflows';

  return {
    schemaVersion: 1,
    status,
    baseFont: input.baseFont,
    sourceText: input.sourceText,
    replacementText:
      input.replacementText,
    observedAdvancePt:
      input.observedAdvancePt,
    fontSizePt:
      input.fontSizePt,
    tolerancePt,
    measuredSourceWidthPt,
    measuredReplacementWidthPt,
    observedToMetricScale,
    projectedReplacementAdvancePt,
    overflowPt,
  };
}

function spacingAdvancePt(
  text: string,
  spacing: { char: number; word: number } | undefined,
): number {
  if (!spacing) return 0;
  let glyphs = 0;
  let spaces = 0;
  for (const character of text) {
    glyphs += 1;
    if (character === ' ') spaces += 1;
  }
  return glyphs * spacing.char + spaces * spacing.word;
}

function standardFontForBaseFont(
  baseFont: string,
  lib: PdfLibNs,
): import('pdf-lib').StandardFonts {
  switch (baseFont) {
    case 'Helvetica':
      return lib.StandardFonts.Helvetica;
    case 'Helvetica-Bold':
      return lib.StandardFonts.HelveticaBold;
    case 'Helvetica-Oblique':
      return lib.StandardFonts.HelveticaOblique;
    case 'Helvetica-BoldOblique':
      return lib.StandardFonts
        .HelveticaBoldOblique;
    case 'Times-Roman':
      return lib.StandardFonts.TimesRoman;
    case 'Times-Bold':
      return lib.StandardFonts.TimesRomanBold;
    case 'Times-Italic':
      return lib.StandardFonts
        .TimesRomanItalic;
    case 'Times-BoldItalic':
      return lib.StandardFonts
        .TimesRomanBoldItalic;
    case 'Courier':
      return lib.StandardFonts.Courier;
    case 'Courier-Bold':
      return lib.StandardFonts.CourierBold;
    case 'Courier-Oblique':
      return lib.StandardFonts.CourierOblique;
    case 'Courier-BoldOblique':
      return lib.StandardFonts
        .CourierBoldOblique;
    default:
      throw new Error(
        `Unsupported Standard-14 BaseFont for fit measurement: ${baseFont}.`,
      );
  }
}

function isStandard14Font(baseFont: string): boolean {
  const clean = baseFont.replace(/^\//, '');
  return (
    clean.startsWith('Helvetica')
    || clean.startsWith('Times')
    || clean.startsWith('Courier')
    || clean.startsWith('Symbol')
    || clean.startsWith('ZapfDingbats')
  );
}
