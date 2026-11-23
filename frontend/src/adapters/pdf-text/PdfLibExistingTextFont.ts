import {
  ExistingTextReplacementError,
} from '@/core/existing-text/replacementError';
import type { PdfFontMetadata } from '@/core/pdf-fonts';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { extractPdfFontFromPage } from './PdfLibFontExtractor';

type PdfLibNs =
  Awaited<
    ReturnType<typeof pdfLib>
  >;
type PDFPageT =
  import('pdf-lib').PDFPage;

const LATIN_STANDARD_14 =
  new Set([
    'Helvetica',
    'Helvetica-Bold',
    'Helvetica-Oblique',
    'Helvetica-BoldOblique',
    'Times-Roman',
    'Times-Bold',
    'Times-Italic',
    'Times-BoldItalic',
    'Courier',
    'Courier-Bold',
    'Courier-Oblique',
    'Courier-BoldOblique',
  ]);

export type Standard14FontName =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique'
  | 'Symbol'
  | 'ZapfDingbats';

export function resolveBestMatchingStandard14Font(
  fontMetadata?: PdfFontMetadata | null,
  fallbackBaseFont?: string,
): Standard14FontName {
  if (fallbackBaseFont && LATIN_STANDARD_14.has(fallbackBaseFont)) {
    return fallbackBaseFont as Standard14FontName;
  }

  const baseFont = fontMetadata?.baseFont ?? fallbackBaseFont ?? '';
  const cleanFamily = fontMetadata?.cleanFontFamily ?? '';
  const combined = `${baseFont} ${cleanFamily}`.toLowerCase();

  const flags = fontMetadata?.descriptor?.flags ?? 0;
  const italicAngle = fontMetadata?.descriptor?.italicAngle ?? 0;

  // ISO 32000-1 Table 123 (Font Flags)
  // Bit 1 = FixedPitch (1), Bit 2 = Serif (2), Bit 7 = Italic (64), Bit 19 = ForceBold (262144)
  const isMonospace =
    (flags & 1) !== 0 ||
    combined.includes('courier') ||
    combined.includes('mono') ||
    combined.includes('consolas') ||
    combined.includes('menlo') ||
    combined.includes('fixed');

  const isSerif =
    (flags & 2) !== 0 ||
    combined.includes('times') ||
    combined.includes('georgia') ||
    combined.includes('garamond') ||
    combined.includes('minion') ||
    combined.includes('cambria') ||
    combined.includes('palatino') ||
    combined.includes('roman') ||
    combined.includes('serif');

  const isBold =
    (flags & 0x40000) !== 0 ||
    combined.includes('bold') ||
    combined.includes('heavy') ||
    combined.includes('black') ||
    combined.includes('semibold');

  const isItalic =
    (flags & 64) !== 0 ||
    italicAngle !== 0 ||
    combined.includes('italic') ||
    combined.includes('oblique') ||
    combined.includes('slant');

  if (isMonospace) {
    if (isBold && isItalic) return 'Courier-BoldOblique';
    if (isBold) return 'Courier-Bold';
    if (isItalic) return 'Courier-Oblique';
    return 'Courier';
  }

  if (isSerif) {
    if (isBold && isItalic) return 'Times-BoldItalic';
    if (isBold) return 'Times-Bold';
    if (isItalic) return 'Times-Italic';
    return 'Times-Roman';
  }

  // Default Sans-Serif: Helvetica
  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

export function standardFontForBaseFont(
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
      return lib.StandardFonts.Helvetica;
  }
}

export function resolveExistingTextFontMetadata(
  page: PDFPageT,
  resourceName: string,
  lib: PdfLibNs,
): PdfFontMetadata {
  const metadata = extractPdfFontFromPage(page, resourceName, lib);
  if (!metadata) {
    throw new ExistingTextReplacementError(
      'UNSUPPORTED_FONT_RESOURCE',
      `The text font resource /${resourceName} cannot be resolved in page resources.`,
    );
  }
  return metadata;
}

export function resolveExistingTextStandard14BaseFont(
  page: PDFPageT,
  resourceName: string,
  lib: PdfLibNs,
): string {
  try {
    const resources =
      page.node.Resources();
    const fonts =
      resources?.lookupMaybe(
        lib.PDFName.of('Font'),
        lib.PDFDict,
      );
    const font =
      fonts?.lookupMaybe(
        lib.PDFName.of(
          resourceName,
        ),
        lib.PDFDict,
      );

    if (!font) {
      throw new ExistingTextReplacementError(
        'UNSUPPORTED_FONT_RESOURCE',
        `The text font resource /${resourceName} cannot be resolved as a simple font dictionary.`,
      );
    }

    const subtype =
      font.lookup(
        lib.PDFName.of(
          'Subtype',
        ),
      );
    const baseFont =
      font.lookup(
        lib.PDFName.of(
          'BaseFont',
        ),
      );

    if (
      !(
        subtype
        instanceof lib.PDFName
      )
      || subtype.decodeText()
        !== 'Type1'
      || !(
        baseFont
        instanceof lib.PDFName
      )
      || !LATIN_STANDARD_14.has(
        baseFont.decodeText(),
      )
    ) {
      throw new ExistingTextReplacementError(
        'UNSUPPORTED_FONT_RESOURCE',
        'Simple existing-text editing is limited to Latin Standard-14 Type1 Helvetica/Times/Courier font resources.',
      );
    }

    const encoding =
      font.lookup(
        lib.PDFName.of(
          'Encoding',
        ),
      );
    if (
      !(
        encoding
        instanceof lib.PDFName
      )
      || encoding.decodeText()
        !== 'WinAnsiEncoding'
    ) {
      throw new ExistingTextReplacementError(
        'UNSUPPORTED_FONT_ENCODING',
        'Simple existing-text editing requires an explicit WinAnsiEncoding font resource.',
      );
    }

    return baseFont.decodeText();
  } catch (error) {
    if (
      error
      instanceof ExistingTextReplacementError
    ) {
      throw error;
    }
    throw new ExistingTextReplacementError(
      'UNSUPPORTED_FONT_RESOURCE',
      `The text font resource /${resourceName} cannot be safely resolved.`,
      [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    );
  }
}
