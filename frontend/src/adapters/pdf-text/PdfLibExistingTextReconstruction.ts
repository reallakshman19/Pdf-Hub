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
} from './PdfLibExistingTextFont';

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
  const baseFont =
    resolveExistingTextStandard14BaseFont(
      page,
      input.provenance
        .fontResourceName,
      lib,
    );
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

  // This is deliberately a visual reconstruction: the original text-show
  // operator remains in the source content stream and is covered only inside
  // the independently proved clearance envelope.
  page.drawRectangle({
    x: clearanceRect.x,
    y: clearanceRect.y,
    width: clearanceRect.width,
    height: clearanceRect.height,
    color: colorFromHex(
      clearance.proof
        .backgroundColorHex,
      lib,
    ),
    opacity: 1,
  });
  page.drawText(
    input.intent.replacementText,
    {
      x: input.span.originPt.x,
      y: input.span.originPt.y,
      size:
        input.provenance
          .fontSizePt,
      font: embeddedFont,
      color: colorFromHex(
        clearance.proof
          .targetTextColorHex,
        lib,
      ),
      opacity: 1,
    },
  );

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
