import type { HeaderFooterTextStyle } from './types';

type PdfLibNs = Awaited<
  ReturnType<typeof import('@/core/pdf/lazyPdfLib').pdfLib>
>;
type PDFDocument = import('pdf-lib').PDFDocument;
type PDFFont = import('pdf-lib').PDFFont;
type PDFImage = import('pdf-lib').PDFImage;

export interface HeaderFooterPdfLibResources {
  fontFor(style: HeaderFooterTextStyle): Promise<PDFFont>;
  imageFor(resourceId: string): Promise<PDFImage>;
  warnings(): string[];
}

export function createHeaderFooterPdfLibResources(
  pdfDoc: PDFDocument,
  lib: PdfLibNs,
  binaryResources: Readonly<Record<string, Uint8Array>>,
): HeaderFooterPdfLibResources {
  const fontCache = new Map<string, Promise<PDFFont>>();
  const imageCache = new Map<string, Promise<PDFImage>>();
  const warningSet = new Set<string>();

  return {
    async fontFor(style) {
      const selection = standardFontName(style, lib, warningSet);
      let font = fontCache.get(selection);
      if (!font) {
        font = pdfDoc.embedFont(selection);
        fontCache.set(selection, font);
      }
      return font;
    },

    async imageFor(resourceId) {
      let imagePromise = imageCache.get(resourceId);
      if (!imagePromise) {
        const bytes = binaryResources[resourceId];
        if (!bytes) {
          throw new Error(
            `Header/footer binary resource is unavailable: ${resourceId}`,
          );
        }
        imagePromise = embedImage(pdfDoc, bytes, resourceId);
        imageCache.set(resourceId, imagePromise);
      }

      return imagePromise;
    },

    warnings() {
      return [...warningSet];
    },
  };
}

function standardFontName(
  style: HeaderFooterTextStyle,
  lib: PdfLibNs,
  warnings: Set<string>,
): string {
  const normalized = style.fontFamily.trim().toLowerCase();
  const family =
    normalized.includes('courier') || normalized.includes('mono')
      ? 'courier'
      : normalized.includes('times')
        || (normalized.includes('serif') && !normalized.includes('sans'))
        ? 'times'
        : 'helvetica';

  if (
    family === 'helvetica'
    && normalized
    && !normalized.includes('helvetica')
    && !normalized.includes('arial')
    && !normalized.includes('sans')
  ) {
    warnings.add(
      `Header/footer font "${style.fontFamily}" is not embedded yet; Helvetica fallback was used.`,
    );
  }

  const bold = style.fontWeight === 'bold';
  const italic = style.fontStyle === 'italic';

  if (family === 'times') {
    if (bold && italic) return lib.StandardFonts.TimesRomanBoldItalic;
    if (bold) return lib.StandardFonts.TimesRomanBold;
    if (italic) return lib.StandardFonts.TimesRomanItalic;
    return lib.StandardFonts.TimesRoman;
  }

  if (family === 'courier') {
    if (bold && italic) return lib.StandardFonts.CourierBoldOblique;
    if (bold) return lib.StandardFonts.CourierBold;
    if (italic) return lib.StandardFonts.CourierOblique;
    return lib.StandardFonts.Courier;
  }

  if (bold && italic) return lib.StandardFonts.HelveticaBoldOblique;
  if (bold) return lib.StandardFonts.HelveticaBold;
  if (italic) return lib.StandardFonts.HelveticaOblique;
  return lib.StandardFonts.Helvetica;
}

async function embedImage(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  resourceId: string,
): Promise<PDFImage> {
  if (looksLikePng(bytes)) {
    return pdfDoc.embedPng(bytes);
  }

  try {
    return await pdfDoc.embedJpg(bytes);
  } catch (error) {
    throw new Error(
      `Header/footer image resource "${resourceId}" is not a supported PNG/JPEG: ${String(error)}`,
    );
  }
}

function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  );
}
