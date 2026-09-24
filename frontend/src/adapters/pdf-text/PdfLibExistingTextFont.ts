import {
  ExistingTextReplacementError,
} from '@/core/existing-text/replacementError';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

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
