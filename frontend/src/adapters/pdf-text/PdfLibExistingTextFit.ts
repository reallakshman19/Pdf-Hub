import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT,
  type ExistingTextNativeFitDiagnostic,
} from '@/core/existing-text/fitTypes';
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
    charSpacingPt?: number;
    wordSpacingPt?: number;
    signal?: AbortSignal;
  },
  lib?: PdfLibNs,
): Promise<ExistingTextNativeFitDiagnostic> {
  const tolerancePt =
    EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT;

  const charSpacingPt =
    input.charSpacingPt !== undefined
      ? input.charSpacingPt
      : 0;
  const wordSpacingPt =
    input.wordSpacingPt !== undefined
      ? input.wordSpacingPt
      : 0;

  if (
    !Number.isFinite(charSpacingPt)
    || !Number.isFinite(wordSpacingPt)
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
      charSpacingPt,
      wordSpacingPt,
      tolerancePt,
    };
  }

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
      charSpacingPt,
      wordSpacingPt,
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
      charSpacingPt,
      wordSpacingPt,
      tolerancePt,
    };
  }

  throwIfAborted(
    input.signal,
    'measure existing-text replacement fit',
  );
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

  const baseSourceWidthPt =
    font.widthOfTextAtSize(
      input.sourceText,
      input.fontSizePt,
    );
  const baseReplacementWidthPt =
    font.widthOfTextAtSize(
      input.replacementText,
      input.fontSizePt,
    );

  if (
    !Number.isFinite(
      baseSourceWidthPt,
    )
    || !Number.isFinite(
      baseReplacementWidthPt,
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
      charSpacingPt,
      wordSpacingPt,
      tolerancePt,
    };
  }

  const measuredSourceWidthPt =
    baseSourceWidthPt
    + (input.sourceText.length * charSpacingPt)
    + (countAsciiSpaces(input.sourceText) * wordSpacingPt);

  const measuredReplacementWidthPt =
    baseReplacementWidthPt
    + (input.replacementText.length * charSpacingPt)
    + (countAsciiSpaces(input.replacementText) * wordSpacingPt);

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
      charSpacingPt,
      wordSpacingPt,
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
      charSpacingPt,
      wordSpacingPt,
      tolerancePt,
    };
  }

  const observedToMetricScale =
    input.observedAdvancePt
    / measuredSourceWidthPt;
  const projectedReplacementAdvancePt =
    measuredReplacementWidthPt
    * observedToMetricScale;
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
    charSpacingPt,
    wordSpacingPt,
    tolerancePt,
    measuredSourceWidthPt,
    measuredReplacementWidthPt,
    observedToMetricScale,
    projectedReplacementAdvancePt,
    overflowPt,
  };
}

function countAsciiSpaces(
  text: string,
): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 32) {
      count += 1;
    }
  }
  return count;
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
